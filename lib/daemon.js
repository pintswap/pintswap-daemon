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
exports.run = exports.loadData = exports.saveData = exports.PINTSWAP_DATA_FILEPATH = exports.expandOffer = exports.expandValues = exports.runServer = exports.loadOrCreatePeerId = exports.PINTSWAP_PEERID_FILEPATH = exports.PINTSWAP_DIRECTORY = exports.providerFromEnv = exports.walletFromEnv = exports.logger = exports.providerFromChainId = void 0;
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
exports.logger = (0, logger_1.createLogger)("pintswap-daemon");
function walletFromEnv() {
    const WALLET = process.env.PINTSWAP_DAEMON_WALLET;
    if (!WALLET) {
        exports.logger.warn("no WALLET defined, generating random wallet as fallback");
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
function runServer(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const hostname = process.env.PINTSWAP_DAEMON_HOST || "127.0.0.1";
        const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
        const uri = hostname + ":" + port;
        yield new Promise((resolve, reject) => {
            app.listen(port, hostname, (err) => (err ? reject(err) : resolve()));
        });
        exports.logger.info("daemon bound to " + uri);
    });
}
exports.runServer = runServer;
function expandValues([token, amount, tokenId], provider) {
    return __awaiter(this, void 0, void 0, function* () {
        if (tokenId)
            return [token, amount, tokenId];
        const { chainId } = yield provider.getNetwork();
        console.log(chainId);
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
        const { givesToken: givesTokenRaw, givesAmount: givesAmountRaw, givesTokenId: givesTokenIdRaw, getsToken: getsTokenRaw, getsAmount: getsAmountRaw, getsTokenId: getsTokenIdRaw } = offer;
        const [givesToken, givesAmount, givesTokenId] = yield expandValues([givesTokenRaw, givesAmountRaw, givesTokenIdRaw], provider);
        const [getsToken, getsAmount, getsTokenId] = yield expandValues([getsTokenRaw, getsAmountRaw, getsTokenIdRaw], provider);
        return {
            givesToken,
            givesAmount,
            givesTokenId,
            getsToken,
            getsAmount,
            getsTokenId
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
        const peerId = yield loadOrCreatePeerId();
        exports.logger.info("using wallet: " + wallet.address);
        const pintswap = new sdk_1.Pintswap({
            awaitReceipts: true,
            signer: wallet,
            peerId,
        });
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
        rpc.post("/subscribe", (req, res) => __awaiter(this, void 0, void 0, function* () {
            (() => __awaiter(this, void 0, void 0, function* () {
                yield pintswap.subscribeOffers();
                res.json({
                    status: "OK",
                    result: "OK",
                });
            }))().catch((err) => exports.logger.error(err));
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
        rpc.use(body_parser_1.default.json({ extended: true }));
        rpc.post("/add", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                const { givesToken, getsToken, givesAmount, getsAmount, givesTokenId, getsTokenId } = yield expandOffer(req.body, pintswap.signer);
                const offer = {
                    gives: {
                        token: givesToken,
                        tokenId: givesTokenId && ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(givesTokenId))),
                        amount: givesAmount && ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(givesAmount))),
                    },
                    gets: {
                        token: getsToken,
                        tokenId: getsTokenId && ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(getsTokenId))),
                        amount: getsAmount && ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(ethers_1.ethers.getUint(getsAmount))),
                    },
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
            const offers = [...pintswap.offers].map(([k, v]) => (Object.assign(Object.assign({}, v), { id: k, link: "https://pintswap.eth.limo/#/" + peerId.toB58String() + "/" + k })));
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
        pintswap.on("trade:maker", (trade) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                exports.logger.info("starting trade");
                trade.on("progress", (step) => {
                    exports.logger.info("step #" + step);
                });
                yield trade.toPromise();
                yield saveData(pintswap);
                exports.logger.info("completed execution");
            }))().catch((err) => exports.logger.error(err));
        });
        yield runServer(rpc);
    });
}
exports.run = run;
//# sourceMappingURL=daemon.js.map