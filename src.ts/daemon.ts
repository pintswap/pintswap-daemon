import express from "express";
import { createLogger } from "@pintswap/sdk/lib/logger";
import { ethers, AbstractProvider, Transaction } from "ethers";
import { hashOffer, Pintswap } from "@pintswap/sdk";
import { mkdirp } from "mkdirp";
import path from "path";
import bodyParser from "body-parser";
import url from "url";
import PeerId from "peer-id";
import fs from "fs-extra";
import { TOKENS_BY_ID } from "./token-list";
import { ZkSyncProvider } from "ethers-v6-zksync-compat";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import clone from "clone";
import { createHandlers } from "./handlers";

const fetch = global.fetch;

let id = 1;

export async function signBundle(signer, body) {
  return `${await signer.getAddress()}:${await signer.signMessage(
    ethers.id(body),
  )}`;
}

export function providerFromChainId(chainId) {
  switch (Number(chainId)) {
    case 1:
      return new ethers.InfuraProvider("mainnet");
    case 42161:
      return new ethers.InfuraProvider("arbitrum");
    case 10:
      return new ethers.InfuraProvider("optimism");
    case 137:
      return new ethers.InfuraProvider("polygon");
    case 324:
      return new ZkSyncProvider();
  }
  throw Error("chainid " + chainId + " not supported");
}

export function toProvider(p) {
  if (p.getAddress) return p.provider;
  return p;
}

export const logger: any = createLogger("pintswap-daemon");

export const broadcast = (wsServer: WebSocketServer, msg: any) => {
  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
};

export const bindLogger = (
  logger: ReturnType<typeof createLogger>,
  wsServer: WebSocketServer,
) => {
  ["debug", "info", "error"].forEach((logLevel) => {
    const fn = logger[logLevel];
    logger[logLevel] = function (...args) {
      const [v] = args;
      const timestamp = Date.now();
      broadcast(
        wsServer,
        JSON.stringify({
          type: "log",
          message: {
            logLevel,
            timestamp,
            data: v,
          },
        }),
      );
      fn.apply(logger, args);
    };
  });
};

export function walletFromEnv() {
  const WALLET = process.env.PINTSWAP_DAEMON_WALLET;
  if (!WALLET) {
    logger.warn(
      "no PINTSWAP_DAEMON_WALLET defined, generating random wallet as fallback",
    );
    return ethers.Wallet.createRandom();
  }
  return new ethers.Wallet(WALLET);
}

export function providerFromEnv() {
  const chainId = Number(process.env.PINTSWAP_DAEMON_CHAINID || 1);
  return providerFromChainId(chainId);
}

export const PINTSWAP_DIRECTORY = path.join(
  process.env.HOME,
  ".pintswap-daemon",
);

export const PINTSWAP_PEERID_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "peer-id.json",
);

export async function loadOrCreatePeerId() {
  await mkdirp(PINTSWAP_DIRECTORY);
  if (await fs.exists(PINTSWAP_PEERID_FILEPATH)) {
    return await PeerId.createFromJSON(
      JSON.parse(await fs.readFile(PINTSWAP_PEERID_FILEPATH, "utf8")),
    );
  }
  logger.info("generating PeerId ...");
  const peerId = await PeerId.create();
  await fs.writeFile(
    PINTSWAP_PEERID_FILEPATH,
    JSON.stringify(peerId.toJSON(), null, 2),
  );
  return peerId;
}

export async function runServer(server: ReturnType<typeof createServer>) {
  const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
  const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
  const uri = hostname + ":" + port;
  await new Promise<void>((resolve, reject) => {
    (server.listen as any)(port, hostname, (err) =>
      err ? reject(err) : resolve(),
    );
  });
  logger.info("daemon bound to " + uri);
}

export async function expandValues([token, amount, tokenId], provider) {
  if (tokenId) return [token, amount, tokenId];
  const { chainId } = await toProvider(provider).getNetwork();
  const tokenRecord = TOKENS_BY_ID[chainId].find(
    (v) =>
      [v.symbol, v.name]
        .map((v) => v.toLowerCase())
        .includes(token.toLowerCase()) ||
      v.address.toLowerCase() === token.toLowerCase(),
  );
  if (tokenRecord)
    return [
      ethers.getAddress(tokenRecord.address),
      ethers.hexlify(
        ethers.toBeArray(ethers.parseUnits(amount, tokenRecord.decimals)),
      ),
    ];
  const address = ethers.getAddress(token);
  const contract = new ethers.Contract(
    address,
    ["function decimals() view returns (uint8)"],
    provider,
  );
  return [
    address,
    ethers.hexlify(
      ethers.toBeArray(ethers.parseUnits(amount, await contract.decimals())),
    ),
  ];
}

export async function expandOffer(offer, provider) {
  const {
    givesToken: givesTokenRaw,
    givesAmount: givesAmountRaw,
    givesTokenId: givesTokenIdRaw,
    getsToken: getsTokenRaw,
    getsAmount: getsAmountRaw,
    getsTokenId: getsTokenIdRaw,
  } = offer;
  const [givesToken, givesAmount, givesTokenId] = await expandValues(
    [givesTokenRaw, givesAmountRaw, givesTokenIdRaw],
    provider,
  );
  const [getsToken, getsAmount, getsTokenId] = await expandValues(
    [getsTokenRaw, getsAmountRaw, getsTokenIdRaw],
    provider,
  );
  return {
    givesToken,
    givesAmount,
    givesTokenId,
    getsToken,
    getsAmount,
    getsTokenId,
  };
}

export const PINTSWAP_DATA_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "data.json",
);
export async function saveData(pintswap) {
  await mkdirp(PINTSWAP_DIRECTORY);
  const data = pintswap.toObject();
  const toSave = {
    userData: data.userData,
    offers: data.offers,
  };
  await fs.writeFile(PINTSWAP_DATA_FILEPATH, JSON.stringify(toSave, null, 2));
}

export async function loadData() {
  await mkdirp(PINTSWAP_DIRECTORY);
  const exists = await fs.exists(PINTSWAP_DATA_FILEPATH);
  if (exists) {
    const data = JSON.parse(await fs.readFile(PINTSWAP_DATA_FILEPATH, "utf8"));
    return {
      userData: {
        bio: data.userData.bio || "",
        image: Buffer.from(data.userData.image, "base64"),
      },
      offers: new Map(data.offers.map((v) => [hashOffer(v), v])),
    };
  }
  return null;
}

function convertToRoute(str: string): string {
  if (str === "del") return "delete";
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export async function run() {
  const wallet = walletFromEnv().connect(providerFromEnv());
  const rpc = express();
  const flashbots = { provider: wallet.provider, authSigner: wallet };
  logger.info(flashbots);
  rpc.use(bodyParser.json({ extended: true } as any));
  rpc.use((req, res, next) => {
    const json = res.json;
    delete req.body[0];
    res.json = function (...args) {
      const [o] = args;
      if (o.status === "NO") {
        o.result =
          process.env.NODE_ENV === "production" ? "NO" : o.result.stack;
        logger.error(o.result);
      } else {
        if (["debug", "development"].includes(process.env.NODE_ENV)) {
          const toLog = { ...o };
          try {
            toLog.result = JSON.parse(o.result);
          } catch (e) {}
          logger.debug(toLog);
        }
      }
      json.apply(res, args);
    };
    logger.info(req.method + "|" + req.originalUrl);
    logger.info(req.body);
    next();
  });
  const peerId = await loadOrCreatePeerId();
  logger.info("using wallet: " + wallet.address);
  const pintswap = new Pintswap({
    awaitReceipts: true,
    signer: wallet,
    peerId,
  });
  pintswap.logger = logger;
  Object.assign(
    pintswap,
    (await loadData()) || {
      userData: { bio: "", image: Buffer.from([]) },
      offers: new Map(),
    },
  );
  await pintswap.startNode();
  logger.info("connected to pintp2p");
  logger.info("using peerid: " + pintswap.address);
  logger.info("registered protocol handlers");
  pintswap.on("peer:discovery", (peer) => {
    logger.info("discovered peer: " + Pintswap.toAddress(peer.toB58String()));
  });
  const handlers = createHandlers({ pintswap, logger, flashbots, saveData });
  Object.entries(handlers.post).map((d) => {
    rpc.post(convertToRoute(d[0]), d[1]);
  });
  pintswap.on("trade:maker", (trade) => {
    (async () => {
      logger.info("starting trade");
      trade.on("progress", (step) => {
        logger.info("step #" + step);
      });
      trade.on("error", (err) => {});
      await trade.toPromise();
      await saveData(pintswap);
      logger.info("completed execution");
    })().catch((err) => logger.error(err));
  });
  const server = createServer(rpc);
  const wsServer = new WebSocketServer({ server });
  pintswap.on("pubsub/orderbook-update", () => {
    broadcast(
      wsServer,
      JSON.stringify({
        type: "orderbook",
        message: {
          data: "UPDATE",
        },
      }),
    );
  });
  bindLogger(logger, wsServer);
  await runServer(server);
}
