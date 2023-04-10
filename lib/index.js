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
exports.runDaemon = exports.runServer = exports.loadOrCreatePeerId = exports.PINTSWAP_PEERID_FILEPATH = exports.PINTSWAP_DIRECTORY = exports.walletFromEnv = exports.logger = exports.providerFromChainId = void 0;
const express_1 = __importDefault(require("express"));
const logger_1 = require("pintswap-sdk/lib/logger");
const ethers_1 = require("ethers");
const pintswap_sdk_1 = require("pintswap-sdk");
const mkdirp_1 = require("mkdirp");
const path_1 = __importDefault(require("path"));
const body_parser_1 = __importDefault(require("body-parser"));
const url_1 = __importDefault(require("url"));
const peer_id_1 = __importDefault(require("peer-id"));
const fs_extra_1 = __importDefault(require("fs-extra"));
function providerFromChainId(chainId) {
    switch (Number(chainId)) {
        case 1:
            return new ethers_1.ethers.InfuraProvider('mainnet');
        case 42161:
            return new ethers_1.ethers.InfuraProvider('arbitrum');
        case 10:
            return new ethers_1.ethers.InfuraProvider('optimism');
        case 137:
            return new ethers_1.ethers.InfuraProvider('polygon');
    }
    throw Error('chainid ' + chainId + ' not supported');
}
exports.providerFromChainId = providerFromChainId;
exports.logger = (0, logger_1.createLogger)('pintswap-daemon');
function walletFromEnv() {
    const WALLET = process.env.PINTSWAP_DAEMON_WALLET;
    if (!WALLET) {
        exports.logger.warn('no WALLET defined, generating random wallet as fallback');
        return ethers_1.ethers.Wallet.createRandom();
    }
    return new ethers_1.ethers.Wallet(WALLET);
}
exports.walletFromEnv = walletFromEnv;
;
exports.PINTSWAP_DIRECTORY = path_1.default.join(process.env.HOME, '.pintswap-daemon');
exports.PINTSWAP_PEERID_FILEPATH = path_1.default.join(exports.PINTSWAP_DIRECTORY, 'peer-id.json');
function loadOrCreatePeerId() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, mkdirp_1.mkdirp)(exports.PINTSWAP_DIRECTORY);
        if (yield fs_extra_1.default.exists(exports.PINTSWAP_PEERID_FILEPATH)) {
            return yield peer_id_1.default.createFromJSON(JSON.parse(yield fs_extra_1.default.readFile(path_1.default.join(exports.PINTSWAP_PEERID_FILEPATH, 'utf8'))));
        }
        exports.logger.info('generating PeerId ...');
        const peerId = yield peer_id_1.default.create();
        yield fs_extra_1.default.writeFile(exports.PINTSWAP_PEERID_FILEPATH, JSON.stringify(peerId.toJSON(), null, 2));
        return peerId;
    });
}
exports.loadOrCreatePeerId = loadOrCreatePeerId;
function runServer(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const hostname = process.env.PINTSWAP_DAEMON_HOST;
        const port = process.env.PINTSWAP_DAEMON_PORT;
        const uri = url_1.default.format({
            hostname,
            port
        });
        yield new Promise((resolve, reject) => {
            app.listen(process.env.PINTSWAP_DAEMON_PORT || 42161, process.env.PINTSWAP_DAEMON_HOST || '127.0.0.1', (err) => err ? reject(err) : resolve());
        });
        exports.logger.info('daemon bound to ' + uri);
    });
}
exports.runServer = runServer;
function runDaemon() {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = walletFromEnv();
        const rpc = (0, express_1.default)();
        const peerId = yield loadOrCreatePeerId();
        exports.logger.info('using wallet: ' + wallet.address);
        const pintswap = new pintswap_sdk_1.Pintswap({ signer: wallet, peerId });
        pintswap.offers = new Map();
        yield pintswap.startNode();
        exports.logger.info('connected to pintp2p');
        exports.logger.info('using multiaddr: ' + peerId.toB58String());
        exports.logger.info('registered protocol handlers');
        pintswap.on('peer:discovery', (peer) => {
            exports.logger.info('discovered peer: ' + peer.id.toB58String());
        });
        rpc.use(body_parser_1.default.json({ extended: true }));
        rpc.post('/add', (req, res) => {
            const { givesToken, getsToken, givesAmount, getsAmount, chainId } = req.body;
            const runner = wallet.connect(providerFromChainId(Number(chainId)));
            const offer = {
                givesToken, getsToken, givesAmount, getsAmount
            };
            const orderHash = (0, pintswap_sdk_1.hashOffer)(offer);
            pintswap.offers.set(orderHash, offer);
            res.json({
                status: 'OK',
                result: orderHash
            });
        });
        rpc.post('/offers', (req, res) => {
            const offers = [...pintswap.offers].map(([k, v]) => (Object.assign(Object.assign({}, v), { id: k, link: 'https://pintswap.eth.limo/#/' + peerId.toB58String() + '/' + k })));
            res.json({
                status: 'OK',
                result: offers
            });
        });
        rpc.post('/delete', (req, res) => {
            const { id } = req.body;
            const result = pintswap.offers.delete(id);
            res.json({
                status: 'OK',
                result
            });
        });
        pintswap.on('trade:maker', (trade) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                exports.logger.info('starting trade');
                trade.on('progress', (step) => {
                    exports.logger.info('step #' + step);
                });
                yield trade.toPromise();
                exports.logger.info('completed execution');
            }))().catch((err) => exports.logger.error(err));
        });
        yield runServer(rpc);
    });
}
exports.runDaemon = runDaemon;
//# sourceMappingURL=index.js.map