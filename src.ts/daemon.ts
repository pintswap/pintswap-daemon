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
import { TOKENS } from "./token-list";
import { fromLimitOrder } from "./orderbook";

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
  }
  throw Error("chainid " + chainId + " not supported");
}

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
    app.listen(port, hostname, (err) => (err ? reject(err) : resolve()));
  });
  logger.info("daemon bound to " + uri);
}

export async function expandValues([token, amount], provider) {
	console.log(token);
  const tokenRecord = TOKENS.find(
    (v) => [v.symbol, v.name].map((v) => v.toLowerCase()).includes(token.toLowerCase()) || v.address.toLowerCase() === token.toLowerCase()
  );
  if (tokenRecord)
    return [
      ethers.getAddress(tokenRecord.address),
      ethers.hexlify(ethers.toBeArray(ethers.parseUnits(amount, tokenRecord.decimals))),
    ];
  const address = ethers.getAddress(token);
  const contract = new ethers.Contract(
    address,
    ["function decimals() view returns (uint8)"],
    provider
  );
  return [
    address,
    ethers.hexlify(ethers.toBeArray(ethers.parseUnits(amount, await contract.decimals()))),
  ];
}

export async function expandOffer(offer, provider) {
  const {
    givesToken: givesTokenRaw,
    givesAmount: givesAmountRaw,
    getsToken: getsTokenRaw,
    getsAmount: getsAmountRaw,
  } = offer;
  const [givesToken, givesAmount] = await expandValues(
    [givesTokenRaw, givesAmountRaw],
    provider
  );
  const [getsToken, getsAmount] = await expandValues(
    [getsTokenRaw, getsAmountRaw],
    provider
  );
  return {
    givesToken,
    givesAmount,
    getsToken,
    getsAmount,
  };
}

export const PINTSWAP_OFFERS_FILEPATH = path.join(PINTSWAP_DIRECTORY, 'offers.json');
export async function saveOffers(pintswap) {
  await mkdirp(PINTSWAP_DIRECTORY);
  const entries = [ ...pintswap.offers.entries() ];
  await fs.writeFile(PINTSWAP_OFFERS_FILEPATH, JSON.stringify(entries, null, 2));
}

export async function loadOffers() {
  await mkdirp(PINTSWAP_DIRECTORY);
  const exists = await fs.exists(PINTSWAP_OFFERS_FILEPATH);
  if (exists) return new Map(JSON.parse(await fs.readFile(PINTSWAP_OFFERS_FILEPATH, 'utf8')));
  else return new Map();
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
  pintswap.offers = await loadOffers();
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
  rpc.use(bodyParser.json({ extended: true }));
  rpc.post("/add", (req, res) => {
    (async () => {
      const { givesToken, getsToken, givesAmount, getsAmount } =
        await expandOffer(req.body, pintswap.signer);
      const offer = {
        givesToken,
        getsToken,
        givesAmount: ethers.hexlify(
          ethers.toBeArray(ethers.getUint(givesAmount))
        ),
        getsAmount: ethers.hexlify(
          ethers.toBeArray(ethers.getUint(getsAmount))
        ),
      };
      const orderHash = hashOffer(offer);
      pintswap.offers.set(orderHash, offer);
      await saveOffers(pintswap);
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
      const { givesToken, getsToken, givesAmount, getsAmount } = await fromLimitOrder(req.body, pintswap.signer);
      const offer = {
        givesToken,
        getsToken,
        givesAmount,
        getsAmount
      };
      const orderHash = hashOffer(offer);
      pintswap.offers.set(orderHash, offer);
      await saveOffers(pintswap);
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
  rpc.post('/register', (req, res) => {
    (async () => {
      const { name } = req.body;
      const response = await pintswap.registerName(name);
      res.json({
        status: 'OK',
	result: response.status
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: 'NO',
	result: err.message
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
      await saveOffers(pintswap);
      res.json({
        status: "OK",
        result,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: 'NO',
	result: err.code
      });
    });
  });
  pintswap.on("trade:maker", (trade) => {
    (async () => {
      logger.info("starting trade");
      trade.on("progress", (step) => {
        logger.info("step #" + step);
      });
      await trade.toPromise();
      await saveOffers(pintswap);
      logger.info("completed execution");
    })().catch((err) => logger.error(err));
  });
  await runServer(rpc);
}
