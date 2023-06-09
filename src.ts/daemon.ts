import express from "express";
import { createLogger } from "@pintswap/sdk/lib/logger";
import { ethers } from "ethers";
import { hashOffer, Pintswap } from "@pintswap/sdk";
import { mkdirp } from "mkdirp";
import path from "path";
import bodyParser from "body-parser";
import url from "url";
import PeerId from "peer-id";
import fs from "fs-extra";
import { TOKENS_BY_ID } from "./token-list";
import { fromLimitOrder } from "./orderbook";
import { ZkSyncProvider } from "ethers-v6-zksync-compat";

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
};

export const logger: any = createLogger("pintswap-daemon");

export function walletFromEnv() {
  const WALLET = process.env.PINTSWAP_DAEMON_WALLET;
  if (!WALLET) {
    logger.warn("no WALLET defined, generating random wallet as fallback");
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
  ".pintswap-daemon"
);

export const PINTSWAP_PEERID_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "peer-id.json"
);

export async function loadOrCreatePeerId() {
  await mkdirp(PINTSWAP_DIRECTORY);
  if (await fs.exists(PINTSWAP_PEERID_FILEPATH)) {
    return await PeerId.createFromJSON(
      JSON.parse(await fs.readFile(PINTSWAP_PEERID_FILEPATH, "utf8"))
    );
  }
  logger.info("generating PeerId ...");
  const peerId = await PeerId.create();
  await fs.writeFile(
    PINTSWAP_PEERID_FILEPATH,
    JSON.stringify(peerId.toJSON(), null, 2)
  );
  return peerId;
}

export async function runServer(app: ReturnType<typeof express>) {
  const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
  const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
  const uri = hostname + ":" + port;
  await new Promise<void>((resolve, reject) => {
    (app.listen as any)(port, hostname, (err) => (err ? reject(err) : resolve()));
  });
  logger.info("daemon bound to " + uri);
}

export async function expandValues([token, amount, tokenId], provider) {
  if (tokenId) return [ token, amount, tokenId ];
  const { chainId } = await toProvider(provider).getNetwork();
  const tokenRecord = TOKENS_BY_ID[chainId].find(
    (v) =>
      [v.symbol, v.name]
        .map((v) => v.toLowerCase())
        .includes(token.toLowerCase()) ||
      v.address.toLowerCase() === token.toLowerCase()
  );
  if (tokenRecord)
    return [
      ethers.getAddress(tokenRecord.address),
      ethers.hexlify(
        ethers.toBeArray(ethers.parseUnits(amount, tokenRecord.decimals))
      ),
    ];
  const address = ethers.getAddress(token);
  const contract = new ethers.Contract(
    address,
    ["function decimals() view returns (uint8)"],
    provider
  );
  return [
    address,
    ethers.hexlify(
      ethers.toBeArray(ethers.parseUnits(amount, await contract.decimals()))
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
    getsTokenId: getsTokenIdRaw
  } = offer;
  const [givesToken, givesAmount, givesTokenId] = await expandValues(
    [givesTokenRaw, givesAmountRaw, givesTokenIdRaw],
    provider
  );
  const [getsToken, getsAmount, getsTokenId] = await expandValues(
    [getsTokenRaw, getsAmountRaw, getsTokenIdRaw],
    provider
  );
  return {
    givesToken,
    givesAmount,
    givesTokenId,
    getsToken,
    getsAmount,
    getsTokenId
  };
}

export const PINTSWAP_DATA_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "data.json"
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

export async function run() {
  const wallet = walletFromEnv().connect(providerFromEnv());
  const rpc = express();
  const peerId = await loadOrCreatePeerId();
  logger.info("using wallet: " + wallet.address);
  const pintswap = new Pintswap({
    awaitReceipts: true,
    signer: wallet,
    peerId,
  });
  Object.assign(
    pintswap,
    (await loadData()) || {
      userData: { bio: "", image: Buffer.from([]) },
      offers: new Map(),
    }
  );
  await pintswap.startNode();
  logger.info("connected to pintp2p");
  logger.info("using multiaddr: " + peerId.toB58String());
  logger.info("registered protocol handlers");
  pintswap.on("peer:discovery", (peer) => {
    logger.info("discovered peer: " + peer.toB58String());
  });
  let publisher = null;
  rpc.post("/publish", (req, res) => {
    if (publisher) {
      logger.info("already publishing offers");
      return res.json({
        status: "NO",
        result: "NO",
      });
    }
    publisher = pintswap.startPublishingOffers(10000);
    logger.info("started publishing offers");
    res.json({
      status: "OK",
      result: "OK",
    });
  });
  rpc.post("/subscribe", async (req, res) => {
    (async () => {
      await pintswap.subscribeOffers();
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => logger.error(err));
  });
  rpc.post("/unsubscribe", async (req, res) => {
    (async () => {
      await pintswap.pubsub.unsubscribe("/pintswap/0.1.0/publish-orders");
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => logger.error(err));
  });
  rpc.post("/quiet", (req, res) => {
    if (publisher) {
      publisher.stop();
      publisher = null;
      logger.info("not publishing offers yet");
      return res.json({
        status: "NO",
        result: "NO",
      });
    }
    logger.info("stopped publishing offers");
    res.json({
      status: "OK",
      result: "OK",
    });
  });
  rpc.use(bodyParser.json({ extended: true } as any));
  rpc.post("/add", (req, res) => {
    (async () => {
      const { givesToken, getsToken, givesAmount, getsAmount, givesTokenId, getsTokenId } =
        await expandOffer(req.body, pintswap.signer);
      const offer = {
        gives: {
          token: givesToken,
	  tokenId: givesTokenId && ethers.hexlify(ethers.toBeArray(ethers.getUint(givesTokenId))),
          amount: givesAmount && ethers.hexlify(ethers.toBeArray(ethers.getUint(givesAmount))),
        },
        gets: {
          token: getsToken,
	  tokenId: getsTokenId && ethers.hexlify(ethers.toBeArray(ethers.getUint(getsTokenId))),
          amount: getsAmount && ethers.hexlify(ethers.toBeArray(ethers.getUint(getsAmount))),
        },
      };
      const orderHash = hashOffer(offer);
      pintswap.offers.set(orderHash, offer);
      await saveData(pintswap);
      res.json({
        status: "OK",
        result: orderHash,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.code || 1,
      });
    });
  });
  rpc.post("/limit", (req, res) => {
    (async () => {
      const { givesToken, getsToken, givesAmount, getsAmount } =
        await fromLimitOrder(req.body, pintswap.signer);
      const offer = {
        gives: { token: givesToken, amount: givesAmount },
        gets: { token: getsToken, amount: getsAmount },
      };
      const orderHash = hashOffer(offer);
      pintswap.offers.set(orderHash, offer);
      await saveData(pintswap);
      res.json({
        status: "OK",
        result: orderHash,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.code || 1,
      });
    });
  });
  rpc.post("/register", (req, res) => {
    (async () => {
      const { name } = req.body;
      const response: any = await pintswap.registerName(name);
      res.json({
        status: "OK",
        result: response.status,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.message,
      });
    });
  });
  rpc.post("/set-bio", (req, res) => {
    (async () => {
      const { bio } = req.body;
      pintswap.setBio(bio);
      await saveData(pintswap);
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.message,
      });
    });
  });
  rpc.post("/set-image", (req, res) => {
    const { image } = req.body;
    (async () => {
      pintswap.setImage(await fs.readFile(image));
      await saveData(pintswap);
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.message,
      });
    });
  });
  rpc.post("/offers", (req, res) => {
    const offers = [...pintswap.offers].map(([k, v]) => ({
      ...v,
      id: k,
      link: "https://pintswap.eth.limo/#/" + peerId.toB58String() + "/" + k,
    }));
    res.json({
      status: "OK",
      result: offers,
    });
  });
  rpc.post("/delete", (req, res) => {
    (async () => {
      const { id } = req.body;
      const result = pintswap.offers.delete(id);
      await saveData(pintswap);
      res.json({
        status: "OK",
        result,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.code,
      });
    });
  });
  pintswap.on("trade:maker", (trade) => {
    (async () => {
      logger.info("starting trade");
      trade.on("progress", (step) => {
        logger.info("step #" + step);
      });
      trade.on('error', (err) => {});
      await trade.toPromise();
      await saveData(pintswap);
      logger.info("completed execution");
    })().catch((err) => logger.error(err));
  });
  await runServer(rpc);
}
