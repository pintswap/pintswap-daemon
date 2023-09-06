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

function convertToRoute(str: string): string {
  if (str === "del") return "delete";
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

interface IFlashbotsInputs {
  provider: ethers.Provider;
  authSigner: ethers.Signer;
}

class PintswapDaemon {
  static PINTSWAP_DATA_FILEPATH = PINTSWAP_DATA_FILEPATH;
  static PINTSWAP_DIRECTORY = PINTSWAP_DIRECTORY;
  static PINTSWAP_PEERID_FILEPATH = PINTSWAP_PEERID_FILEPATH;
  public wallet: ethers.Wallet;
  public rpc: ReturnType<typeof express>;
  public logger: typeof logger;
  public pintswap: Pintswap;
  public server: ReturnType<typeof createServer>;
  public wsServer: WebSocketServer;
  public handlers: ReturnType<typeof createHandlers>;
  async broadcast(msg: any) {
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }
  async runServer() {
    const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
    const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
    const uri = hostname + ":" + port;
    await new Promise<void>((resolve, reject) => {
      (this.server.listen as any)(port, hostname, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    this.logger.info("daemon bound to " + uri);
  }

  async saveData() {
    await mkdirp((this.constructor as any).PINTSWAP_DIRECTORY);
    const data = this.pintswap.toObject();
    const toSave = {
      userData: data.userData,
      offers: data.offers,
    };
    await fs.writeFile(
      (this.constructor as any).PINTSWAP_DATA_FILEPATH,
      JSON.stringify(toSave, null, 2),
    );
  }
  async loadData() {
    await mkdirp((this.constructor as any).PINTSWAP_DIRECTORY);
    const exists = await fs.exists(
      (this.constructor as any).PINTSWAP_DATA_FILEPATH,
    );
    if (exists) {
      const data = JSON.parse(
        await fs.readFile(
          (this.constructor as any).PINTSWAP_DATA_FILEPATH,
          "utf8",
        ),
      );
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

  get flashbots() {
    return { provider: this.wallet.provider, authSigner: this.wallet };
  }
  constructor() {
    this.logger = logger;
    this.wallet = walletFromEnv().connect(providerFromEnv()) as ethers.Wallet;
    this.rpc = express();
    this.logger.info(this.flashbots);
    this.bindMiddleware();
    this.bindLogger();
    this.bindRoutes();
  }
  static async create() {
    const instance = new this();
    await instance.instantiatePintswap();
    return instance;
  }
  async start() {
    await this.initializePintswap();
  }
  async loadOrCreatePeerId() {
    await mkdirp((this.constructor as any).PINTSWAP_DIRECTORY);
    if (await fs.exists(PINTSWAP_PEERID_FILEPATH)) {
      return await PeerId.createFromJSON(
        JSON.parse(
          await fs.readFile(
            (this.constructor as any).PINTSWAP_PEERID_FILEPATH,
            "utf8",
          ),
        ),
      );
    }
    this.logger.info("generating PeerId ...");
    const peerId = await PeerId.create();
    await fs.writeFile(
      (this.constructor as any).PINTSWAP_PEERID_FILEPATH,
      JSON.stringify(peerId.toJSON(), null, 2),
    );
    return peerId;
  }
  bindMiddleware() {
    this.rpc.use(bodyParser.json({ extended: true } as any));
    const self = this;
    this.rpc.use((req, res, next) => {
      const json = res.json;
      delete req.body[0];
      res.json = function (...args) {
        const [o] = args;
        if (o.status === "NO") {
          o.result =
            process.env.NODE_ENV === "production" ? "NO" : o.result.stack;
          self.logger.error(o.result);
        } else {
          if (["debug", "development"].includes(process.env.NODE_ENV)) {
            const toLog = { ...o };
            try {
              toLog.result = JSON.parse(o.result);
            } catch (e) {}
            self.logger.debug(toLog);
          }
        }
        json.apply(res, args);
      };
      this.logger.info(req.method + "|" + req.originalUrl);
      this.logger.info(req.body);
      next();
    });
  }
  async instantiatePintswap() {
    const peerId = await this.loadOrCreatePeerId();
    this.logger.info("using wallet: " + this.wallet.address);
    this.pintswap = new Pintswap({
      awaitReceipts: true,
      signer: this.wallet,
      peerId,
    });
    this.pintswap.logger = logger;
    Object.assign(
      this.pintswap,
      (await this.loadData()) || {
        userData: { bio: "", image: Buffer.from([]) },
        offers: new Map(),
      },
    );
  }
  async initializePintswap() {
    await this.pintswap.startNode();
    this.logger.info("connected to pintp2p");
    this.logger.info("using peerid: " + this.pintswap.address);
    this.logger.info("registered protocol handlers");
    this.pintswap.on("peer:discovery", (peer) => {
      logger.info("discovered peer: " + Pintswap.toAddress(peer.toB58String()));
    });
    this.pintswap.on("trade:maker", (trade) => {
      (async () => {
        this.logger.info("starting trade");
        trade.on("progress", (step) => {
          this.logger.info("step #" + step);
        });
        trade.on("error", (err) => {});
        await trade.toPromise();
        await this.saveData();
        this.logger.info("completed execution");
      })().catch((err) => this.logger.error(err));
    });
  }
  bindLogger() {
    const self = this;
    ["debug", "info", "error"].forEach((logLevel) => {
      const fn = this.logger[logLevel];
      this.logger[logLevel] = function (...args) {
        const [v] = args;
        const timestamp = Date.now();
        self.broadcast(
          JSON.stringify({
            type: "log",
            message: {
              logLevel,
              timestamp,
              data: v,
            },
          }),
        );
        fn.apply(self.logger, args);
      };
    });
  }
  bindRoutes() {
    this.handlers = createHandlers({
      pintswap: this.pintswap,
      logger: this.logger,
      flashbots: this.flashbots,
      saveData: this.saveData.bind(this),
    });
    Object.entries(this.handlers.post).map((d) => {
      this.rpc.post(convertToRoute(d[0]), d[1]);
    });
    this.server = createServer(this.rpc);
    this.wsServer = new WebSocketServer({ server: this.server });
    this.pintswap.on("pubsub/orderbook-update", () => {
      this.broadcast(
        JSON.stringify({
          type: "orderbook",
          message: {
            data: "UPDATE",
          },
        }),
      );
    });
  }
}
