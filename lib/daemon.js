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
exports.PintswapDaemon = exports.PINTSWAP_DATA_FILEPATH = exports.expandOffer = exports.expandValues = exports.PINTSWAP_PEERID_FILEPATH = exports.PINTSWAP_DIRECTORY = exports.providerFromEnv = exports.walletFromEnv = exports.logger = exports.toProvider = exports.providerFromChainId = exports.signBundle = void 0;
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
const ethers_v6_zksync_compat_1 = require("ethers-v6-zksync-compat");
const http_1 = require("http");
const ws_1 = require("ws");
const utils_1 = require("./utils");
const estimate_hypothetical_gas_1 = require("estimate-hypothetical-gas");
const orderbook_1 = require("./orderbook");
const fetch = global.fetch;
let id = 1;
function signBundle(signer, body) {
    return __awaiter(this, void 0, void 0, function* () {
        return `${yield signer.getAddress()}:${yield signer.signMessage(ethers_1.ethers.id(body))}`;
    });
}
exports.signBundle = signBundle;
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
function convertToRoute(str) {
    if (str === "del")
        return "delete";
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
class PintswapDaemon {
    broadcast(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.wsServer)
                this.wsServer.clients.forEach((client) => {
                    if (client.readyState === ws_1.WebSocket.OPEN)
                        client.send(msg);
                });
        });
    }
    runServer() {
        return __awaiter(this, void 0, void 0, function* () {
            const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
            const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
            const uri = hostname + ":" + port;
            yield new Promise((resolve, reject) => {
                this.server.listen(port, hostname, (err) => err ? reject(err) : resolve());
            });
            this.logger.info("daemon bound to " + uri);
        });
    }
    saveData() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, mkdirp_1.mkdirp)(this.constructor.PINTSWAP_DIRECTORY);
            const data = this.pintswap.toObject();
            const toSave = {
                userData: data.userData,
                offers: data.offers,
            };
            yield fs_extra_1.default.writeFile(this.constructor.PINTSWAP_DATA_FILEPATH, JSON.stringify(toSave, null, 2));
        });
    }
    loadData() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, mkdirp_1.mkdirp)(this.constructor.PINTSWAP_DIRECTORY);
            const exists = yield fs_extra_1.default.exists(this.constructor.PINTSWAP_DATA_FILEPATH);
            if (exists) {
                const data = JSON.parse(yield fs_extra_1.default.readFile(this.constructor.PINTSWAP_DATA_FILEPATH, "utf8"));
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
    get flashbots() {
        return { provider: this.wallet.provider, authSigner: this.wallet };
    }
    constructor() {
        this.logger = exports.logger;
        this.wallet = walletFromEnv().connect(providerFromEnv());
        this.rpc = (0, express_1.default)();
        this.logger.info(this.flashbots);
        this.bindMiddleware();
        this.bindLogger();
    }
    static create() {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = new this();
            return instance;
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.instantiatePintswap();
            this.bindRoutes();
            yield this.initializePintswap();
            yield this.runServer();
        });
    }
    loadOrCreatePeerId() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, mkdirp_1.mkdirp)(this.constructor.PINTSWAP_DIRECTORY);
            if (yield fs_extra_1.default.exists(exports.PINTSWAP_PEERID_FILEPATH)) {
                return yield peer_id_1.default.createFromJSON(JSON.parse(yield fs_extra_1.default.readFile(this.constructor.PINTSWAP_PEERID_FILEPATH, "utf8")));
            }
            this.logger.info("generating PeerId ...");
            const peerId = yield peer_id_1.default.create();
            yield fs_extra_1.default.writeFile(this.constructor.PINTSWAP_PEERID_FILEPATH, JSON.stringify(peerId.toJSON(), null, 2));
            return peerId;
        });
    }
    bindMiddleware() {
        this.rpc.use(body_parser_1.default.json({ extended: true }));
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
                }
                else {
                    if (["debug", "development"].includes(process.env.NODE_ENV)) {
                        const toLog = Object.assign({}, o);
                        try {
                            toLog.result = JSON.parse(o.result);
                        }
                        catch (e) { }
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
    instantiatePintswap() {
        return __awaiter(this, void 0, void 0, function* () {
            const peerId = yield this.loadOrCreatePeerId();
            this.logger.info("using wallet: " + this.wallet.address);
            this.pintswap = new sdk_1.Pintswap({
                awaitReceipts: true,
                signer: this.wallet,
                peerId,
            });
            this.pintswap.logger = exports.logger;
            Object.assign(this.pintswap, (yield this.loadData()) || {
                userData: { bio: "", image: Buffer.from([]) },
                offers: new Map(),
            });
        });
    }
    initializePintswap() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.pintswap.startNode();
            this.logger.info("connected to pintp2p");
            //@ts-ignore
            this.logger.info("using peerid: " + this.pintswap.address);
            this.logger.info("registered protocol handlers");
            this.pintswap.on("peer:discovery", (peer) => {
                //@ts-ignore
                exports.logger.info("discovered peer: " + sdk_1.Pintswap.toAddress(peer.toB58String()));
            });
            this.pintswap.on("trade:maker", (trade) => {
                (() => __awaiter(this, void 0, void 0, function* () {
                    this.logger.info("starting trade");
                    trade.on("progress", (step) => {
                        this.logger.info("step #" + step);
                    });
                    trade.on("error", (err) => { });
                    yield trade.toPromise();
                    yield this.saveData();
                    this.logger.info("completed execution");
                }))().catch((err) => this.logger.error(err));
            });
        });
    }
    bindLogger() {
        const self = this;
        ["debug", "info", "error"].forEach((logLevel) => {
            const fn = this.logger[logLevel];
            this.logger[logLevel] = function (...args) {
                const [v] = args;
                const timestamp = Date.now();
                self.broadcast(JSON.stringify({
                    type: "log",
                    message: {
                        logLevel,
                        timestamp,
                        data: v,
                    },
                }));
                fn.apply(self.logger, args);
            };
        });
    }
    createHandlers() {
        let publisher;
        const peer = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    let { peer: thisPeer } = req.body;
                    if (thisPeer.match("."))
                        thisPeer = yield this.pintswap.resolveName(thisPeer);
                    //@ts-ignore
                    const peerObject = yield this.pintswap.getUserData(thisPeer);
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
            }))().catch((err) => this.logger.error(err));
        };
        const resolve = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { name } = req.body;
                    const resolved = yield this.pintswap.resolveName(name);
                    res.json({
                        status: "OK",
                        result: resolved,
                    });
                }
                catch (e) {
                    res.json({ status: "NO", result: e });
                }
            }))().catch((err) => this.logger.error(err));
        };
        const publish = (req, res) => {
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
        const orderbook = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const peers = [...this.pintswap.peers.entries()]
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
            }))().catch((err) => this.logger.error(err));
        };
        const peerImage = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    let { peer } = req.body;
                    if (peer.match("."))
                        peer = yield this.pintswap.resolveName(peer);
                    //@ts-ignore
                    const peerObject = yield this.pintswap.getUserData(peer);
                    res.setHeader("content-type", "image/x-png");
                    res.setHeader("content-length", String(Buffer.from(peerObject.image).length));
                    res.send(Buffer.from(peerObject.image));
                    res.end("");
                }
                catch (e) {
                    res.json({ status: "NO", result: e });
                }
            }))().catch((err) => this.logger.error(err));
        };
        const subscribe = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield this.pintswap.subscribeOffers();
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => this.logger.error(err));
        };
        const trade = (req, res) => __awaiter(this, void 0, void 0, function* () {
            let { broadcast, trades, peer } = req.body;
            try {
                if (peer.indexOf(".") !== -1)
                    peer = yield this.pintswap.resolveName(peer);
                //@ts-ignore
                const { offers } = yield this.pintswap.getUserData(peer);
                trades = trades.map((v) => ({
                    amount: v.amount,
                    offer: offers.find((u) => (0, sdk_1.hashOffer)(u) === v.offerHash),
                }));
                const txs = [];
                const providerProxy = this.pintswap.signer.provider._getProvider();
                providerProxy.waitForTransaction = () => __awaiter(this, void 0, void 0, function* () {
                    return {};
                });
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
                providerProxy.getTransactionCount = function (address) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const signerAddress = yield signerProxy.getAddress();
                        if (address === signerAddress) {
                            if (!nonce) {
                                exports.logger.debug("nonce::" + nonce);
                                nonce = yield getTransactionCount.call(providerProxy, address);
                                return nonce;
                            }
                            else {
                                exports.logger.debug("nonce::" + nonce);
                                return nonce++;
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
                const estimateGasBound = estimate_hypothetical_gas_1.estimateGas.bind(null, this.pintswap.signer.provider);
                const { provider } = this.pintswap.signer;
                providerProxy.estimateGas = function (...args) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const [txParams] = args;
                        if (!txParams.to)
                            return yield estimateGasBound(...args);
                        return yield estimateGasOriginal.apply(provider, args);
                    });
                };
                let result;
                const _trades = pintswapProxy.createBatchTrade(peer, trades);
                exports.logger.info(JSON.stringify(_trades));
                yield _trades.toPromise();
                if (broadcast) {
                    const blockNumber = yield providerProxy.getBlockNumber();
                    const bundleResult = (yield (0, utils_1.sendBundle)(this.pintswap.logger, this.flashbots, txs.map((v) => v.transaction), blockNumber + 1));
                    result = JSON.stringify(bundleResult, null, 2);
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
        });
        const unsubscribe = (req, res) => __awaiter(this, void 0, void 0, function* () {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield this.pintswap.pubsub.unsubscribe("/pintswap/0.1.0/publish-orders");
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => this.logger.error(err));
        });
        const quiet = (req, res) => {
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
        const add = (req, res) => {
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
                this.pintswap.offers.set(orderHash, offer);
                yield this.saveData();
                res.json({
                    status: "OK",
                    result: orderHash,
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code || 1,
                });
            });
        };
        const limit = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { givesToken, getsToken, givesAmount, getsAmount } = yield (0, orderbook_1.fromLimitOrder)(req.body, this.pintswap.signer);
                const offer = {
                    gives: { token: givesToken, amount: givesAmount },
                    gets: { token: getsToken, amount: getsAmount },
                };
                const orderHash = (0, sdk_1.hashOffer)(offer);
                this.pintswap.offers.set(orderHash, offer);
                yield this.saveData();
                res.json({
                    status: "OK",
                    result: orderHash,
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code || 1,
                });
            });
        };
        const register = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { name } = req.body;
                const response = yield this.pintswap.registerName(name);
                res.json({
                    status: "OK",
                    result: response.status,
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        };
        const address = (req, res) => {
            try {
                res.json({
                    status: "OK",
                    //@ts-ignore
                    result: this.pintswap.address,
                });
            }
            catch (e) {
                res.json({
                    status: "NO",
                    result: e,
                });
            }
        };
        const ethereumAddress = (req, res) => {
            res.json({
                status: "OK",
                result: this.pintswap.signer.address,
            });
        };
        const setBio = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { bio } = req.body;
                this.pintswap.setBio(bio);
                yield this.saveData();
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        };
        const setImage = (req, res) => {
            const { image } = req.body;
            (() => __awaiter(this, void 0, void 0, function* () {
                //@ts-ignore
                this.pintswap.setImage(yield fs_extra_1.default.readFile(image));
                yield this.saveData();
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.message,
                });
            });
        };
        const offers = (req, res) => {
            const _offers = [...this.pintswap.offers].map(([k, v]) => (Object.assign(Object.assign({}, v), { id: k })));
            res.json({
                status: "OK",
                result: _offers,
            });
        };
        const del = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { id } = req.body;
                const result = this.pintswap.offers.delete(id);
                yield this.saveData();
                res.json({
                    status: "OK",
                    result,
                });
            }))().catch((err) => {
                this.logger.error(err);
                res.json({
                    status: "NO",
                    result: err.code,
                });
            });
        };
        const clear = (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                for (const [key] of this.pintswap.offers.entries()) {
                    this.pintswap.offers.delete(key);
                }
                yield this.saveData();
                res.json({
                    status: "OK",
                    result: 0,
                });
            }))().catch((err) => {
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
        this.server = (0, http_1.createServer)(this.rpc);
        this.wsServer = new ws_1.WebSocketServer({ server: this.server });
        this.pintswap.on("/pubsub/orderbook-update", () => {
            this.broadcast(JSON.stringify({
                type: "orderbook",
                message: {
                    data: "UPDATE",
                },
            }));
        });
    }
}
exports.PintswapDaemon = PintswapDaemon;
PintswapDaemon.PINTSWAP_DATA_FILEPATH = exports.PINTSWAP_DATA_FILEPATH;
PintswapDaemon.PINTSWAP_DIRECTORY = exports.PINTSWAP_DIRECTORY;
PintswapDaemon.PINTSWAP_PEERID_FILEPATH = exports.PINTSWAP_PEERID_FILEPATH;
//# sourceMappingURL=daemon.js.map