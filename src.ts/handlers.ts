import { hashOffer, Pintswap } from "@pintswap/sdk";
import { sendBundle } from "./utils";
import { estimateGas } from "estimate-hypothetical-gas";
import { ethers, Transaction } from "ethers";
import { fromLimitOrder } from "./orderbook";
import fs from "fs";
type Handler = (req: any, res: any) => void;

export const createHandlers = ({
  pintswap,
  logger,
  flashbots,
  saveData,
}: {
  pintswap: Pintswap | any;
  logger: any;
  flashbots: any;
  saveData: any;
}) => {
  let publisher: any;
  const peer: Handler = (req, res) => {
    (async () => {
      try {
        let { peer } = req.body;
        if (peer.match(".")) peer = await pintswap.resolveName(peer);
        const peerObject = await pintswap.getUserData(peer);
        delete peerObject.image;
        peerObject.offers = peerObject.offers.map(({ gets, gives }) => ({
          gets,
          gives,
          id: hashOffer({ gets, gives }),
        }));
        const result = JSON.stringify(peerObject, null, 2);
        res.json({
          status: "OK",
          result,
        });
      } catch (e) {
        res.json({ status: "NO", result: e });
      }
    })().catch((err) => logger.error(err));
  };

  const resolve: Handler = (req, res) => {
    (async () => {
      try {
        const { name } = req.body;
        const resolved = await pintswap.resolveName(name);
        res.json({
          status: "OK",
          result: resolved,
        });
      } catch (e) {
        res.json({ status: "NO", result: e });
      }
    })().catch((err) => logger.error(err));
  };

  const publish: Handler = (req, res) => {
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
  };
  const orderbook: Handler = (req, res) => {
    (async () => {
      try {
        const peers = [...pintswap.peers.entries()]
          .filter(([key]) => !key.match("::"))
          .map((v) => [
            v[0],
            v[1][1].map(({ gets, gives }) => ({
              gets,
              gives,
              id: hashOffer({ gets, gives }),
            })),
          ]);
        res.json({
          status: "OK",
          result: JSON.stringify(peers, null, 2),
        });
      } catch (e) {
        res.json({
          status: "OK",
          result: e,
        });
      }
    })().catch((err) => logger.error(err));
  };

  const peerImage = (req, res) => {
    (async () => {
      try {
        let { peer } = req.body;
        if (peer.match(".")) peer = await pintswap.resolveName(peer);
        const peerObject = await pintswap.getUserData(peer);
        res.setHeader("content-type", "image/x-png");
        res.setHeader(
          "content-length",
          String(Buffer.from(peerObject.image as any).length),
        );
        res.send(Buffer.from(peerObject.image as any) as any);
        res.end("");
      } catch (e) {
        res.json({ status: "NO", result: e });
      }
    })().catch((err) => logger.error(err));
  };

  const subscribe = (req, res) => {
    (async () => {
      await pintswap.subscribeOffers();
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => logger.error(err));
  };
  const trade: Handler = async (req, res) => {
    let { broadcast, trades, peer } = req.body;
    try {
      if (peer.indexOf(".") !== -1) peer = await pintswap.resolveName(peer);
      const { offers } = await pintswap.getUserData(peer);
      trades = trades.map((v) => ({
        amount: v.amount,
        offer: offers.find((u) => hashOffer(u) === v.offerHash),
      }));
      const txs = [];
      const providerProxy = pintswap.signer.provider._getProvider();
      providerProxy.waitForTransaction = async () => {
        return {};
      };
      const signerProxy = pintswap.signer.connect(providerProxy);
      const pintswapProxy = Object.create(pintswap);
      pintswapProxy._awaitReceipts = false;
      pintswapProxy.signer = signerProxy;
      const logTx = (v) => {
        pintswap.logger.info("signed tx:");
        pintswap.logger.info(v);
        return v;
      };
      const { getTransactionCount } = providerProxy;
      let nonce;
      providerProxy.getTransactionCount = async function (address) {
        const signerAddress = await signerProxy.getAddress();
        if (address === signerAddress) {
          if (!nonce) {
            nonce = await getTransactionCount.call(providerProxy, address);
            return nonce;
          } else {
            return ++nonce;
          }
        } else return getTransactionCount.call(providerProxy, address);
      };
      providerProxy.broadcastTransaction = async function (...args) {
        const [serializedTransaction] = args;
        const tx = Transaction.from(serializedTransaction);
        if (!tx.to) {
          txs.push(
            logTx({
              sharedAddress: tx.from,
              type: "trade",
              transaction: serializedTransaction,
            }),
          );
        } else if (tx.data === "0x") {
          txs.push(
            logTx({
              sharedAddress: tx.to,
              type: "gas",
              transaction: serializedTransaction,
            }),
          );
        } else {
          txs.push(
            logTx({
              sharedAddress: tx.to,
              type: "deposit",
              transaction: serializedTransaction,
            }),
          );
        }
        return {
          hash: tx.hash,
          async wait() {
            return {};
          },
        };
      };
      const estimateGasOriginal = providerProxy.estimateGas;
      const estimateGasBound = estimateGas.bind(null, pintswap.signer.provider);
      providerProxy.estimateGas = async function (...args) {
        const [txParams] = args;
        if (!txParams.to) return await estimateGasBound(...args);
        return await estimateGasOriginal.apply(pintswap.signer.provider, args);
      };
      await pintswapProxy.createBatchTrade(peer, trades).toPromise();
      let result;
      if (broadcast) {
        const blockNumber = await providerProxy.getBlockNumber();
        const bundleResult = (await sendBundle(
          pintswap.logger,
          flashbots,
          txs.map((v) => v.transaction),
          blockNumber + 1,
        )) as any;
        result = JSON.stringify(bundleResult, null, 2);
      } else result = JSON.stringify(txs, null, 2);
      res.json({
        status: "OK",
        result,
      });
    } catch (e) {
      res.json({
        status: "NO",
        result: e,
      });
    }
  };
  const unsubscribe: Handler = async (req, res) => {
    (async () => {
      await pintswap.pubsub.unsubscribe("/pintswap/0.1.0/publish-orders");
      res.json({
        status: "OK",
        result: "OK",
      });
    })().catch((err) => logger.error(err));
  };
  const quiet: Handler = (req, res) => {
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
  };
  const add: Handler = (req, res) => {
    (async () => {
      const {
        givesToken,
        getsToken,
        givesAmount,
        getsAmount,
        givesTokenId,
        getsTokenId,
      } = req.body;
      const offer = {
        gives: {
          token: givesToken,
          tokenId:
            givesTokenId &&
            ethers.hexlify(ethers.toBeArray(ethers.getUint(givesTokenId))),
          amount:
            givesAmount &&
            ethers.hexlify(ethers.toBeArray(ethers.getUint(givesAmount))),
        },
        gets: {
          token: getsToken,
          tokenId:
            getsTokenId &&
            ethers.hexlify(ethers.toBeArray(ethers.getUint(getsTokenId))),
          amount:
            getsAmount &&
            ethers.hexlify(ethers.toBeArray(ethers.getUint(getsAmount))),
        },
      };
      if (offer.gives.tokenId === undefined) delete offer.gives.tokenId;
      if (offer.gets.tokenId === undefined) delete offer.gets.tokenId;
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
  };
  const limit: Handler = (req, res) => {
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
  };
  const register: Handler = (req, res) => {
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
  };
  const address: Handler = (req, res) => {
    try {
      res.json({
        status: "OK",
        result: pintswap.address,
      });
    } catch (e) {
      res.json({
        status: "NO",
        result: e,
      });
    }
  };
  const ethereumAddress: Handler = (req, res) => {
    res.json({
      status: "OK",
      result: pintswap.signer.address,
    });
  };
  const setBio: Handler = (req, res) => {
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
  };
  const setImage: Handler = (req, res) => {
    const { image } = req.body;
    (async () => {
      //@ts-ignore
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
  };
  const offers: Handler = (req, res) => {
    const _offers = [...pintswap.offers].map(([k, v]) => ({
      ...v,
      id: k,
    }));
    res.json({
      status: "OK",
      result: _offers,
    });
  };

  const del: Handler = (req, res) => {
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
  };
  const clear: Handler = (req, res) => {
    (async () => {
      for (const [key] of pintswap.offers.entries()) {
        pintswap.offers.delete(key);
      }
      await saveData(pintswap);
      res.json({
        status: "OK",
        result: 0,
      });
    })().catch((err) => {
      logger.error(err);
      res.json({
        status: "NO",
        result: err.code,
      });
    });
  };
  return {
    post: {
      peer,
      resolve,
      publish,
      orderbook,
      peerImage,
      subscribe,
      trade,
      unsubscribe,
      quiet,
      add,
      limit,
      register,
      address,
      ethereumAddress,
      setBio,
      setImage,
      offers,
      del,
      clear,
    },
  };
};
