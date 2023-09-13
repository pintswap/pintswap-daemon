import express from "express";
import { createLogger } from "@pintswap/sdk/lib/logger";
import { ethers, AbstractProvider, Transaction } from "ethers";
import { hashOffer, Pintswap } from "@pintswap/sdk/src.ts/index";
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

import { sendBundle } from "./utils";
import { estimateGas } from "estimate-hypothetical-gas";
import { fromLimitOrder } from "./orderbook";

type Handler = (req: any, res: any) => void;

const fetch = global.fetch;

let id = 1;

export async function signBundle(signer, body) {
  return `${await signer.getAddress()}:${await signer.signMessage(
    ethers.id(body)
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
      "no PINTSWAP_DAEMON_WALLET defined, generating random wallet as fallback"
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
  ".pintswap-daemon"
);

export const PINTSWAP_PEERID_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "peer-id.json"
);

export async function expandValues([token, amount, tokenId], provider) {
  if (tokenId) return [token, amount, tokenId];
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
    getsTokenId: getsTokenIdRaw,
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
    getsTokenId,
  };
}

export const PINTSWAP_DATA_FILEPATH = path.join(
  PINTSWAP_DIRECTORY,
  "data.json"
);

function convertToRoute(str: string): string {
  if (str === "del") return "delete";
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

interface IFlashbotsInputs {
  provider: ethers.Provider;
  authSigner: ethers.Signer;
}

export class PintswapDaemon {
  static PINTSWAP_DATA_FILEPATH = PINTSWAP_DATA_FILEPATH;
  static PINTSWAP_DIRECTORY = PINTSWAP_DIRECTORY;
  static PINTSWAP_PEERID_FILEPATH = PINTSWAP_PEERID_FILEPATH;
  public wallet: ethers.Wallet;
  public rpc: ReturnType<typeof express>;
  public logger: typeof logger;
  public pintswap: Pintswap;
  public server: ReturnType<typeof createServer>;
  public wsServer: WebSocketServer;
  public handlers: ReturnType<typeof this.createHandlers>;
  async broadcast(msg: any) {
    if (this.wsServer)
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
        err ? reject(err) : resolve()
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
      JSON.stringify(toSave, null, 2)
    );
  }
  async loadData() {
    await mkdirp((this.constructor as any).PINTSWAP_DIRECTORY);
    const exists = await fs.exists(
      (this.constructor as any).PINTSWAP_DATA_FILEPATH
    );
    if (exists) {
      const data = JSON.parse(
        await fs.readFile(
          (this.constructor as any).PINTSWAP_DATA_FILEPATH,
          "utf8"
        )
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
  }
  static async create() {
    const instance = new this();
    return instance;
  }
  async start() {
    await this.instantiatePintswap();
    this.bindRoutes();
    await this.initializePintswap();
    await this.runServer();
  }
  async loadOrCreatePeerId() {
    await mkdirp((this.constructor as any).PINTSWAP_DIRECTORY);
    if (await fs.exists(PINTSWAP_PEERID_FILEPATH)) {
      return await PeerId.createFromJSON(
        JSON.parse(
          await fs.readFile(
            (this.constructor as any).PINTSWAP_PEERID_FILEPATH,
            "utf8"
          )
        )
      );
    }
    this.logger.info("generating PeerId ...");
    const peerId = await PeerId.create();
    await fs.writeFile(
      (this.constructor as any).PINTSWAP_PEERID_FILEPATH,
      JSON.stringify(peerId.toJSON(), null, 2)
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
      }
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
          })
        );
        fn.apply(self.logger, args);
      };
    });
  }
  createHandlers() {
    let publisher: any;
    const peer: Handler = (req, res) => {
      (async () => {
        try {
          let { peer: thisPeer } = req.body;
          if (thisPeer.match("."))
            thisPeer = await this.pintswap.resolveName(thisPeer);
          const peerObject = await this.pintswap.getUserData(thisPeer);
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
      })().catch((err) => this.logger.error(err));
    };

    const resolve: Handler = (req, res) => {
      (async () => {
        try {
          const { name } = req.body;
          const resolved = await this.pintswap.resolveName(name);
          res.json({
            status: "OK",
            result: resolved,
          });
        } catch (e) {
          res.json({ status: "NO", result: e });
        }
      })().catch((err) => this.logger.error(err));
    };

    const publish: Handler = (req, res) => {
      if (publisher) {
        this.logger.info("already publishing offers");
        return res.json({
          status: "NO",
          result: "NO",
        });
      }
      publisher = this.pintswap.startPublishingOffers(10000);
      this.logger.info("started publishing offers");
      res.json({
        status: "OK",
        result: "OK",
      });
    };
    const orderbook: Handler = (req, res) => {
      (async () => {
        try {
          const peers = [...this.pintswap.peers.entries()]
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
      })().catch((err) => this.logger.error(err));
    };

    const peerImage = (req, res) => {
      (async () => {
        try {
          let { peer } = req.body;
          if (peer.match(".")) peer = await this.pintswap.resolveName(peer);
          const peerObject = await this.pintswap.getUserData(peer);
          res.setHeader("content-type", "image/x-png");
          res.setHeader(
            "content-length",
            String(Buffer.from(peerObject.image as any).length)
          );
          res.send(Buffer.from(peerObject.image as any) as any);
          res.end("");
        } catch (e) {
          res.json({ status: "NO", result: e });
        }
      })().catch((err) => this.logger.error(err));
    };

    const subscribe = (req, res) => {
      (async () => {
        await this.pintswap.subscribeOffers();
        res.json({
          status: "OK",
          result: "OK",
        });
      })().catch((err) => this.logger.error(err));
    };
    const trade: Handler = async (req, res) => {
      let { broadcast, trades, peer } = req.body;
      try {
        if (peer.indexOf(".") !== -1)
          peer = await this.pintswap.resolveName(peer);
        const { offers } = await this.pintswap.getUserData(peer);
        trades = trades.map((v) => ({
          amount: v.amount,
          offer: offers.find((u) => hashOffer(u) === v.offerHash),
        }));
        const txs = [];
        const providerProxy = this.pintswap.signer.provider._getProvider();
        providerProxy.waitForTransaction = async () => {
          return {};
        };
        const signerProxy = this.pintswap.signer.connect(providerProxy);
        const pintswapProxy = Object.create(this.pintswap);
        pintswapProxy._awaitReceipts = false;
        pintswapProxy.signer = signerProxy;
        const logTx = (v) => {
          this.pintswap.logger.info("signed tx:");
          this.pintswap.logger.info(v);
          return v;
        };
        const { getTransactionCount } = providerProxy;
        let nonce;
        providerProxy.getTransactionCount = async function (address) {
          const signerAddress = await signerProxy.getAddress();
          if (address === signerAddress) {
            if (!nonce) {
              logger.debug("nonce::" + nonce);
              nonce = await getTransactionCount.call(providerProxy, address);
              return nonce;
            } else {
              logger.debug("nonce::" + nonce);
              return nonce++;
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
              })
            );
          } else if (tx.data === "0x") {
            txs.push(
              logTx({
                sharedAddress: tx.to,
                type: "gas",
                transaction: serializedTransaction,
              })
            );
          } else {
            txs.push(
              logTx({
                sharedAddress: tx.to,
                type: "deposit",
                transaction: serializedTransaction,
              })
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
        const estimateGasBound = estimateGas.bind(
          null,
          this.pintswap.signer.provider
        );
        const { provider } = this.pintswap.signer;
        providerProxy.estimateGas = async function (...args) {
          const [txParams] = args;
          if (!txParams.to) return await estimateGasBound(...args);
          return await estimateGasOriginal.apply(provider, args);
        };
        let result;
        const _trades = pintswapProxy.createBatchTrade(peer, trades);
        logger.info(JSON.stringify(_trades));
        await _trades.toPromise();
        if (broadcast) {
          const blockNumber = await providerProxy.getBlockNumber();
          const bundleResult = (await sendBundle(
            this.pintswap.logger,
            this.flashbots,
            txs.map((v) => v.transaction),
            blockNumber + 1
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
        await this.pintswap.pubsub.unsubscribe(
          "/pintswap/0.1.0/publish-orders"
        );
        res.json({
          status: "OK",
          result: "OK",
        });
      })().catch((err) => this.logger.error(err));
    };
    const quiet: Handler = (req, res) => {
      if (publisher) {
        publisher.stop();
        publisher = null;
        this.logger.info("not publishing offers yet");
        return res.json({
          status: "NO",
          result: "NO",
        });
      }
      this.logger.info("stopped publishing offers");
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
        this.pintswap.offers.set(orderHash, offer);
        await this.saveData();
        res.json({
          status: "OK",
          result: orderHash,
        });
      })().catch((err) => {
        this.logger.error(err);
        res.json({
          status: "NO",
          result: err.code || 1,
        });
      });
    };
    const limit: Handler = (req, res) => {
      (async () => {
        const { givesToken, getsToken, givesAmount, getsAmount } =
          await fromLimitOrder(req.body, this.pintswap.signer);
        const offer = {
          gives: { token: givesToken, amount: givesAmount },
          gets: { token: getsToken, amount: getsAmount },
        };
        const orderHash = hashOffer(offer);
        this.pintswap.offers.set(orderHash, offer);
        await this.saveData();
        res.json({
          status: "OK",
          result: orderHash,
        });
      })().catch((err) => {
        this.logger.error(err);
        res.json({
          status: "NO",
          result: err.code || 1,
        });
      });
    };
    const register: Handler = (req, res) => {
      (async () => {
        const { name } = req.body;
        const response: any = await this.pintswap.registerName(name);
        res.json({
          status: "OK",
          result: response.status,
        });
      })().catch((err) => {
        this.logger.error(err);
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
          result: this.pintswap.address,
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
        result: this.pintswap.signer.address,
      });
    };
    const setBio: Handler = (req, res) => {
      (async () => {
        const { bio } = req.body;
        this.pintswap.setBio(bio);
        await this.saveData();
        res.json({
          status: "OK",
          result: "OK",
        });
      })().catch((err) => {
        this.logger.error(err);
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
        this.pintswap.setImage(await fs.readFile(image));
        await this.saveData();
        res.json({
          status: "OK",
          result: "OK",
        });
      })().catch((err) => {
        this.logger.error(err);
        res.json({
          status: "NO",
          result: err.message,
        });
      });
    };
    const offers: Handler = (req, res) => {
      const _offers = [...this.pintswap.offers].map(([k, v]) => ({
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
        const result = this.pintswap.offers.delete(id);
        await this.saveData();
        res.json({
          status: "OK",
          result,
        });
      })().catch((err) => {
        this.logger.error(err);
        res.json({
          status: "NO",
          result: err.code,
        });
      });
    };
    const clear: Handler = (req, res) => {
      (async () => {
        for (const [key] of this.pintswap.offers.entries()) {
          this.pintswap.offers.delete(key);
        }
        await this.saveData();
        res.json({
          status: "OK",
          result: 0,
        });
      })().catch((err) => {
        this.logger.error(err);
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
  }
  bindRoutes() {
    this.handlers = this.createHandlers();
    Object.entries(this.handlers.post).map((d) => {
      this.rpc.post("/" + convertToRoute(d[0]), d[1]);
    });
    this.server = createServer(this.rpc);
    this.wsServer = new WebSocketServer({ server: this.server });
    this.pintswap.on("/pubsub/orderbook-update", () => {
      this.broadcast(
        JSON.stringify({
          type: "orderbook",
          message: {
            data: "UPDATE",
          },
        })
      );
    });
  }
}
