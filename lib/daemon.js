"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.loadData = exports.saveData = exports.PINTSWAP_DATA_FILEPATH = exports.expandOffer = exports.expandValues = exports.runServer = exports.loadOrCreatePeerId = exports.PINTSWAP_PEERID_FILEPATH = exports.PINTSWAP_DIRECTORY = exports.providerFromEnv = exports.walletFromEnv = exports.bindLogger = exports.broadcast = exports.logger = exports.toProvider = exports.providerFromChainId = exports.sendBundle = exports.signBundle = void 0;
const express_1 = __importDefault(require("express"));
const logger_1 = require("@pintswap/sdk/lib/logger");
const ethers_1 = require("ethers");
const sdk_1 = require("@pintswap/sdk");
const mkdirp_1 = require("mkdirp");
const path_1 = __importDefault(require("path"));
const body_parser_1 = __importDefault(require("body-parser"));
const peer_id_1 = __importDefault(require("peer-id"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const token_list_1 = require("./token-list");
const orderbook_1 = require("./orderbook");
const ethers_v6_zksync_compat_1 = require("ethers-v6-zksync-compat");
const estimate_hypothetical_gas_1 = require("estimate-hypothetical-gas");
const http_1 = require("http");
const ws_1 = require("ws");
const flashbots_1 = require("./flashbots");
const fetch = global.fetch;
let id = 1;
function signBundle(signer, body) {
    return __awaiter(this, void 0, void 0, function* () {
        return `${yield signer.getAddress()}:${yield signer.signMessage(ethers_1.ethers.id(body))}`;
    });
}
exports.signBundle = signBundle;
function sendBundle(flashbots, txs, blockNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield flashbots.sendBundle(txs, blockNumber);
        return response;
    });
}
exports.sendBundle = sendBundle;
function providerFromChainId(chainId) {
    switch (Number(chainId)) {
        case 1:
            return new ethers_1.ethers.InfuraProvider("mainnet");
        case 42161:
            return new ethers_1.ethers.InfuraProvider("arbitrum");
        case 10:
            return new ethers_1.ethers.InfuraProvider("optimism");
        case 137:
            return new ethers_1.ethers.InfuraProvider("polygon");
        case 324:
            return new ethers_v6_zksync_compat_1.ZkSyncProvider();
    }
    throw Error("chainid " + chainId + " not supported");
}
exports.providerFromChainId = providerFromChainId;
function toProvider(p) {
    if (p.getAddress)
        return p.provider;
    return p;
}
exports.toProvider = toProvider;
exports.logger = (0, logger_1.createLogger)("pintswap-daemon");
const broadcast = (wsServer, msg) => {
    wsServer.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN)
            client.send(msg);
    });
};
exports.broadcast = broadcast;
const bindLogger = (logger, wsServer) => {
    ["debug", "info", "error"].forEach((logLevel) => {
        const fn = logger[logLevel];
        logger[logLevel] = function (...args) {
            const [v] = args;
            const timestamp = Date.now();
            (0, exports.broadcast)(wsServer, JSON.stringify({
                type: "log",
                message: {
                    logLevel,
                    timestamp,
                    data: v,
                },
            }));
            fn.apply(logger, args);
        };
    });
};
exports.bindLogger = bindLogger;
function walletFromEnv() {
    const WALLET = process.env.PINTSWAP_DAEMON_WALLET;
    if (!WALLET) {
        exports.logger.warn("no PINTSWAP_DAEMON_WALLET defined, generating random wallet as fallback");
        return ethers_1.ethers.Wallet.createRandom();
    }
    return new ethers_1.ethers.Wallet(WALLET);
}
exports.walletFromEnv = walletFromEnv;
function providerFromEnv() {
    const chainId = Number(process.env.PINTSWAP_DAEMON_CHAINID || 1);
    return providerFromChainId(chainId);
}
exports.providerFromEnv = providerFromEnv;
exports.PINTSWAP_DIRECTORY = path_1.default.join(process.env.HOME, ".pintswap-daemon");
exports.PINTSWAP_PEERID_FILEPATH = path_1.default.join(exports.PINTSWAP_DIRECTORY, "peer-id.json");
function loadOrCreatePeerId() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, mkdirp_1.mkdirp)(exports.PINTSWAP_DIRECTORY);
        if (yield fs_extra_1.default.exists(exports.PINTSWAP_PEERID_FILEPATH)) {
            return yield peer_id_1.default.createFromJSON(JSON.parse(yield fs_extra_1.default.readFile(exports.PINTSWAP_PEERID_FILEPATH, "utf8")));
        }
        exports.logger.info("generating PeerId ...");
        const peerId = yield peer_id_1.default.create();
        yield fs_extra_1.default.writeFile(exports.PINTSWAP_PEERID_FILEPATH, JSON.stringify(peerId.toJSON(), null, 2));
        return peerId;
    });
}
exports.loadOrCreatePeerId = loadOrCreatePeerId;
function runServer(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
        const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
        const uri = hostname + ":" + port;
        yield new Promise((resolve, reject) => {
            server.listen(port, hostname, (err) => err ? reject(err) : resolve());
        });
        exports.logger.info("daemon bound to " + uri);
    });
}
exports.runServer = runServer;
function expandValues([token, amount, tokenId], provider) {
    return __awaiter(this, void 0, void 0, function* () {
        if (tokenId)
            return [token, amount, tokenId];
        const { chainId } = yield toProvider(provider).getNetwork();
        const tokenRecord = token_list_1.TOKENS_BY_ID[chainId].find((v) => [v.symbol, v.name]
            .map((v) => v.toLowerCase())
            .includes(token.toLowerCase()) ||
            v.address.toLowerCase() === token.toLowerCase());
        if (tokenRecord)
            return [
                ethers_1.ethers.getAddress(tokenRecord.address),
                ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.parseUnits(amount, tokenRecord.decimals))),
            ];
        const address = ethers_1.ethers.getAddress(token);
        const contract = new ethers_1.ethers.Contract(address, ["function decimals() view returns (uint8)"], provider);
        return [
            address,
            ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.parseUnits(amount, yield contract.decimals()))),
        ];
    });
}
exports.expandValues = expandValues;
function expandOffer(offer, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const { givesToken: givesTokenRaw, givesAmount: givesAmountRaw, givesTokenId: givesTokenIdRaw, getsToken: getsTokenRaw, getsAmount: getsAmountRaw, getsTokenId: getsTokenIdRaw, } = offer;
        const [givesToken, givesAmount, givesTokenId] = yield expandValues([givesTokenRaw, givesAmountRaw, givesTokenIdRaw], provider);
        const [getsToken, getsAmount, getsTokenId] = yield expandValues([getsTokenRaw, getsAmountRaw, getsTokenIdRaw], provider);
        return {
            givesToken,
            givesAmount,
            givesTokenId,
            getsToken,
            getsAmount,
            getsTokenId,
        };
    });
}
exports.expandOffer = expandOffer;
exports.PINTSWAP_DATA_FILEPATH = path_1.default.join(exports.PINTSWAP_DIRECTORY, "data.json");
function saveData(pintswap) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, mkdirp_1.mkdirp)(exports.PINTSWAP_DIRECTORY);
        const data = pintswap.toObject();
        const toSave = {
            userData: data.userData,
            offers: data.offers,
        };
        yield fs_extra_1.default.writeFile(exports.PINTSWAP_DATA_FILEPATH, JSON.stringify(toSave, null, 2));
    });
}
exports.saveData = saveData;
function loadData() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, mkdirp_1.mkdirp)(exports.PINTSWAP_DIRECTORY);
        const exists = yield fs_extra_1.default.exists(exports.PINTSWAP_DATA_FILEPATH);
        if (exists) {
            const data = JSON.parse(yield fs_extra_1.default.readFile(exports.PINTSWAP_DATA_FILEPATH, "utf8"));
            return {
                userData: {
                    bio: data.userData.bio || "",
                    image: Buffer.from(data.userData.image, "base64"),
                },
                offers: new Map(data.offers.map((v) => [(0, sdk_1.hashOffer)(v), v])),
            };
        }
        return null;
    });
}
exports.loadData = loadData;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = walletFromEnv().connect(providerFromEnv());
        const rpc = (0, express_1.default)();
        const flashbots = yield flashbots_1.FlashbotsBundleProvider.create(wallet.provider, wallet);
        exports.logger.info(flashbots);
        rpc.use(body_parser_1.default.json({ extended: true }));
        rpc.use((req, res, next) => {
            const json = res.json;
            delete req.body[0];
            res.json = function (...args) {
                const [o] = args;
                if (o.status === "NO") {
                    o.result =
                        process.env.NODE_ENV === "production" ? "NO" : o.result.stack;
                    exports.logger.error(o.result);
                }
                else {
                    if (["debug", "development"].includes(process.env.NODE_ENV)) {
                        const toLog = Object.assign({}, o);
                        try {
                            toLog.result = JSON.parse(o.result);
                        }
                        catch (e) { }
                        exports.logger.debug(toLog);
                    }
                }
                json.apply(res, args);
            };
            exports.logger.info(req.method + "|" + req.originalUrl);
            exports.logger.info(req.body);
            next();
        });
        const peerId = yield loadOrCreatePeerId();
        exports.logger.info("using wallet: " + wallet.address);
        const pintswap = new sdk_1.Pintswap({
            awaitReceipts: true,
            signer: wallet,
            peerId,
        });
        pintswap.logger = exports.logger;
        Object.assign(pintswap, (yield loadData()) || {
            userData: { bio: "", image: Buffer.from([]) },
            offers: new Map(),
        });
        yield pintswap.startNode();
        exports.logger.info("connected to pintp2p");
        exports.logger.info("using multiaddr: " + peerId.toB58String());
        exports.logger.info("registered protocol handlers");
        pintswap.on("peer:discovery", (peer) => {
            exports.logger.info("discovered peer: " + peer.toB58String());
        });
        let publisher = null;
        rpc.post("/publish", (req, res) => {
            if (publisher) {
                exports.logger.info("already publishing offers");
                return res.json({
                    status: "NO",
                    result: "NO",
                });
            }
            publisher = pintswap.startPublishingOffers(10000);
            exports.logger.info("started publishing offers");
            res.json({
                status: "OK",
                result: "OK",
            });
        });
        rpc.post("/resolve", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { name } = req.body;
                    const resolved = yield pintswap.resolveName(name);
                    res.json({
                        status: "OK",
                        result: resolved,
                    });
                }
                catch (e) {
                    res.json({ status: "NO", result: e });
                }
            }))().catch((err) => exports.logger.error(err));
        });
        rpc.post("/peer", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    let { peer } = req.body;
                    if (peer.match("."))
                        peer = yield pintswap.resolveName(peer);
                    const peerObject = yield pintswap.getUserDataByPeerId(peer);
                    delete peerObject.image;
                    peerObject.offers = peerObject.offers.map(({ gets, gives }) => ({
                        gets,
                        gives,
                        id: (0, sdk_1.hashOffer)({ gets, gives }),
                    }));
                    const result = JSON.stringify(peerObject, null, 2);
                    res.json({
                        status: "OK",
                        result,
                    });
                }
                catch (e) {
                    res.json({ status: "NO", result: e });
                }
            }))().catch((err) => exports.logger.error(err));
        });
        rpc.post("/orderbook", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const peers = [...pintswap.peers.entries()]
                        .filter(([key]) => !key.match("::"))
                        .map((v) => [
                        v[0],
                        v[1][1].map(({ gets, gives }) => ({
                            gets,
                            gives,
                            id: (0, sdk_1.hashOffer)({ gets, gives }),
                        })),
                    ]);
                    res.json({
                        status: "OK",
                        result: JSON.stringify(peers, null, 2),
                    });
                }
                catch (e) {
                    res.json({
                        status: "OK",
                        result: e,
                    });
                }
            }))().catch((err) => exports.logger.error(err));
        });
        rpc.post("/peer-image", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    let { peer } = req.body;
                    if (peer.match("."))
                        peer = yield pintswap.resolveName(peer);
                    const peerObject = yield pintswap.getUserDataByPeerId(peer);
                    res.setHeader("content-type", "image/x-png");
                    res.setHeader("content-length", String(Buffer.from(peerObject.image).length));
                    res.send(Buffer.from(peerObject.image));
                    res.end("");
                }
                catch (e) {
                    res.json({ status: "NO", result: e });
                }
            }))().catch((err) => exports.logger.error(err));
        });
        rpc.post("/subscribe", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield pintswap.subscribeOffers();
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => exports.logger.error(err));
        });
        rpc.post("/trade", (req, res) => __awaiter(this, void 0, void 0, function* () {
            let { broadcast, trades, peer } = req.body;
            try {
                if (peer.indexOf("."))
                    peer = yield pintswap.resolveName(peer);
                const { offers } = yield pintswap.getUserDataByPeerId(peer);
                trades = trades.map((v) => ({
                    amount: v.amount,
                    offer: offers.find((u) => (0, sdk_1.hashOffer)(u) === v.offerHash),
                }));
                const txs = [];
                const providerProxy = pintswap.signer.provider._getProvider();
                providerProxy.waitForTransaction = () => __awaiter(this, void 0, void 0, function* () {
                    return {};
                });
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
                providerProxy.getTransactionCount = function (address) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const signerAddress = yield signerProxy.getAddress();
                        if (address === signerAddress) {
                            if (!nonce) {
                                nonce = yield getTransactionCount.call(providerProxy, address);
                                return nonce;
                            }
                            else {
                                return ++nonce;
                            }
                        }
                        else
                            return getTransactionCount.call(providerProxy, address);
                    });
                };
                providerProxy.broadcastTransaction = function (...args) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const [serializedTransaction] = args;
                        const tx = ethers_1.Transaction.from(serializedTransaction);
                        if (!tx.to) {
                            txs.push(logTx({
                                sharedAddress: tx.from,
                                type: "trade",
                                transaction: serializedTransaction,
                            }));
                        }
                        else if (tx.data === "0x") {
                            txs.push(logTx({
                                sharedAddress: tx.to,
                                type: "gas",
                                transaction: serializedTransaction,
                            }));
                        }
                        else {
                            txs.push(logTx({
                                sharedAddress: tx.to,
                                type: "deposit",
                                transaction: serializedTransaction,
                            }));
                        }
                        return {
                            hash: tx.hash,
                            wait() {
                                return __awaiter(this, void 0, void 0, function* () {
                                    return {};
                                });
                            },
                        };
                    });
                };
                const estimateGasOriginal = providerProxy.estimateGas;
                const estimateGasBound = estimate_hypothetical_gas_1.estimateGas.bind(null, pintswap.signer.provider);
                pintswapProxy.estimateGas = function (...args) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const [txParams] = args;
                        if (!txParams.to)
                            return yield estimateGasBound(...args);
                        return yield estimateGasOriginal.apply(pintswap.signer.provider, args);
                    });
                };
                yield pintswapProxy
                    .createBatchTrade(peer_id_1.default.createFromB58String(peer), trades)
                    .toPromise();
                let result;
                if (broadcast) {
                    const blockNumber = yield providerProxy.getBlockNumber();
                    const bundleResult = yield sendBundle(flashbots, txs.map((v) => v.transaction), blockNumber + 1);
                    result = JSON.stringify({ bundleHash: bundleResult.bundleHash, bundleTransactions: bundleResult.bundleTransactions }, null, 2);
                }
                else
                    result = JSON.stringify(txs, null, 2);
                res.json({
                    status: "OK",
                    result,
                });
            }
            catch (e) {
                res.json({
                    status: "NO",
                    result: e,
                });
            }
        }));
        rpc.post("/unsubscribe", (req, res) => __awaiter(this, void 0, void 0, function* () {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield pintswap.pubsub.unsubscribe("/pintswap/0.1.0/publish-orders");
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => exports.logger.error(err));
        }));
        rpc.post("/quiet", (req, res) => {
            if (publisher) {
                publisher.stop();
                publisher = null;
                exports.logger.info("not publishing offers yet");
                return res.json({
                    status: "NO",
                    result: "NO",
                });
            }
            exports.logger.info("stopped publishing offers");
            res.json({
                status: "OK",
                result: "OK",
            });
        });
        rpc.post("/add", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { givesToken, getsToken, givesAmount, getsAmount, givesTokenId, getsTokenId, } = req.body;
                const offer = {
                    gives: {
                        token: givesToken,
                        tokenId: givesTokenId &&
                            ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(givesTokenId))),
                        amount: givesAmount &&
                            ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(givesAmount))),
                    },
                    gets: {
                        token: getsToken,
                        tokenId: getsTokenId &&
                            ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(getsTokenId))),
                        amount: getsAmount &&
                            ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(getsAmount))),
                    },
                };
                if (offer.gives.tokenId === undefined)
                    delete offer.gives.tokenId;
                if (offer.gets.tokenId === undefined)
                    delete offer.gets.tokenId;
                const orderHash = (0, sdk_1.hashOffer)(offer);
                pintswap.offers.set(orderHash, offer);
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result: orderHash,
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code || 1,
                });
            });
        });
        rpc.post("/limit", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { givesToken, getsToken, givesAmount, getsAmount } = yield (0, orderbook_1.fromLimitOrder)(req.body, pintswap.signer);
                const offer = {
                    gives: { token: givesToken, amount: givesAmount },
                    gets: { token: getsToken, amount: getsAmount },
                };
                const orderHash = (0, sdk_1.hashOffer)(offer);
                pintswap.offers.set(orderHash, offer);
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result: orderHash,
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code || 1,
                });
            });
        });
        rpc.post("/register", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { name } = req.body;
                const response = yield pintswap.registerName(name);
                res.json({
                    status: "OK",
                    result: response.status,
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        });
        rpc.post("/set-bio", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { bio } = req.body;
                pintswap.setBio(bio);
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        });
        rpc.post("/set-image", (req, res) => {
            const { image } = req.body;
            (() => __awaiter(this, void 0, void 0, function* () {
                pintswap.setImage(yield fs_extra_1.default.readFile(image));
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        });
        rpc.post("/offers", (req, res) => {
            const offers = [...pintswap.offers].map(([k, v]) => (Object.assign(Object.assign({}, v), { id: k })));
            res.json({
                status: "OK",
                result: offers,
            });
        });
        rpc.post("/delete", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { id } = req.body;
                const result = pintswap.offers.delete(id);
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result,
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code,
                });
            });
        });
        rpc.post("/clear", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                for (const [key] of pintswap.offers.entries()) {
                    pintswap.offers.delete(key);
                }
                yield saveData(pintswap);
                res.json({
                    status: "OK",
                    result: 0,
                });
            }))().catch((err) => {
                exports.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code,
                });
            });
        });
        pintswap.on("trade:maker", (trade) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                exports.logger.info("starting trade");
                trade.on("progress", (step) => {
                    exports.logger.info("step #" + step);
                });
                trade.on("error", (err) => { });
                yield trade.toPromise();
                yield saveData(pintswap);
                exports.logger.info("completed execution");
            }))().catch((err) => exports.logger.error(err));
        });
        const server = (0, http_1.createServer)(rpc);
        const wsServer = new ws_1.WebSocketServer({ server });
        pintswap.on("pubsub/orderbook-update", () => {
            (0, exports.broadcast)(wsServer, JSON.stringify({
                type: "orderbook",
                message: {
                    data: "UPDATE",
                },
            }));
        });
        (0, exports.bindLogger)(exports.logger, wsServer);
        yield runServer(server);
    });
}
exports.run = run;
//# sourceMappingURL=daemon.js.map