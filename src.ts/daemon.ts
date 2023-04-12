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

export async function run() {
  const wallet = walletFromEnv().connect(providerFromEnv());
  const rpc = express();
  const peerId = await loadOrCreatePeerId();
  logger.info("using wallet: " + wallet.address);
  const pintswap = new Pintswap({ awaitReceipts: true, signer: wallet, peerId });
  pintswap.offers = new Map();
  await pintswap.startNode();
  logger.info("connected to pintp2p");
  logger.info("using multiaddr: " + peerId.toB58String());
  logger.info("registered protocol handlers");
  pintswap.on("peer:discovery", (peer) => {
    logger.info("discovered peer: " + peer.id.toB58String());
  });
  rpc.use(bodyParser.json({ extended: true }));
  rpc.post("/add", (req, res) => {
    const { givesToken, getsToken, givesAmount, getsAmount, chainId } =
      req.body;
    const offer = {
      givesToken,
      getsToken,
      givesAmount: ethers.hexlify(ethers.toBeArray(ethers.getUint(givesAmount))),
      getsAmount: ethers.hexlify(ethers.toBeArray(ethers.getUint(getsAmount)))
    };
    const orderHash = hashOffer(offer);
    pintswap.offers.set(orderHash, offer);
    res.json({
      status: "OK",
      result: orderHash,
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
    const { id } = req.body;
    const result = pintswap.offers.delete(id);
    res.json({
      status: "OK",
      result,
    });
  });
  pintswap.on("trade:maker", (trade) => {
    (async () => {
      logger.info("starting trade");
      trade.on("progress", (step) => {
        logger.info("step #" + step);
      });
      await trade.toPromise();
      logger.info("completed execution");
    })().catch((err) => logger.error(err));
  });
  await runServer(rpc);
}
