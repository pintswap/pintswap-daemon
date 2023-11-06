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
Object.defineProperty(exports, "__esModule", { value: true });
exports.callBundle = exports.sendBundle = exports.timeout = exports.camelCase = exports.waitForBlock = void 0;
const flashbots_1 = require("./flashbots");
function waitForBlock(provider, number) {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            const block = yield provider.getBlock(Number(number));
            if (block)
                return block;
            yield (0, exports.timeout)(3000);
        }
    });
}
exports.waitForBlock = waitForBlock;
function camelCase(s) {
    const parts = s.split('-');
    return parts[0] + parts.slice(1).map((v) => v[0].toUpperCase() + v.substr(1).toLowerCase()).join('');
}
exports.camelCase = camelCase;
const BUILDER_RPCS = [
    "https://relay.flashbots.net",
    "https://builder0x69.io",
    "https://rpc.beaverbuild.org",
    "https://rsync-builder.xyz",
    "https://rpc.titanbuilder.xyz",
    "https://api.edennetwork.io/v1/bundle",
];
const timeout = (n) => __awaiter(void 0, void 0, void 0, function* () { return yield new Promise((resolve) => setTimeout(resolve, n)); });
exports.timeout = timeout;
function sendBundle(logger, flashbots, txs, blockNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = flashbots.provider;
        const list = yield Promise.all(BUILDER_RPCS.map((rpc) => __awaiter(this, void 0, void 0, function* () {
            return (yield flashbots_1.FlashbotsBundleProvider.create(flashbots.provider, flashbots.authSigner, rpc))
                .sendRawBundle(txs, blockNumber)
                .catch((err) => {
                logger.error(err);
            });
        })));
        const { bundleTransactions } = list.find(Boolean);
        const { hash: txHash } = bundleTransactions[bundleTransactions.length - 1];
        logger.info("waiting for block " + Number(blockNumber));
        yield waitForBlock(provider, blockNumber);
        const receipt = yield provider.getTransactionReceipt(txHash);
        logger.info("receipt:");
        logger.info(receipt);
        if (!receipt)
            return yield sendBundle(logger, flashbots, txs, blockNumber + 5);
        return receipt;
    });
}
exports.sendBundle = sendBundle;
function callBundle(logger, flashbots, txs, blockNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (yield flashbots_1.FlashbotsBundleProvider.create(flashbots.provider, flashbots.authSigner, BUILDER_RPCS[0])).simulate(txs, blockNumber);
    });
}
exports.callBundle = callBundle;
//# sourceMappingURL=utils.js.map