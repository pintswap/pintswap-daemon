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
exports.FlashbotsBundleProvider = exports.FlashbotsBundleConflictType = exports.FlashbotsTransactionResolution = exports.FlashbotsBundleResolution = exports.BASE_FEE_MAX_CHANGE_DENOMINATOR = exports.DEFAULT_FLASHBOTS_RELAY = void 0;
const web_1 = require("@ethersproject/web");
const ethers_1 = require("ethers");
exports.DEFAULT_FLASHBOTS_RELAY = "https://relay.flashbots.net";
exports.BASE_FEE_MAX_CHANGE_DENOMINATOR = 8;
var FlashbotsBundleResolution;
(function (FlashbotsBundleResolution) {
    FlashbotsBundleResolution[FlashbotsBundleResolution["BundleIncluded"] = 0] = "BundleIncluded";
    FlashbotsBundleResolution[FlashbotsBundleResolution["BlockPassedWithoutInclusion"] = 1] = "BlockPassedWithoutInclusion";
    FlashbotsBundleResolution[FlashbotsBundleResolution["AccountNonceTooHigh"] = 2] = "AccountNonceTooHigh";
})(FlashbotsBundleResolution || (exports.FlashbotsBundleResolution = FlashbotsBundleResolution = {}));
var FlashbotsTransactionResolution;
(function (FlashbotsTransactionResolution) {
    FlashbotsTransactionResolution[FlashbotsTransactionResolution["TransactionIncluded"] = 0] = "TransactionIncluded";
    FlashbotsTransactionResolution[FlashbotsTransactionResolution["TransactionDropped"] = 1] = "TransactionDropped";
})(FlashbotsTransactionResolution || (exports.FlashbotsTransactionResolution = FlashbotsTransactionResolution = {}));
var FlashbotsBundleConflictType;
(function (FlashbotsBundleConflictType) {
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["NoConflict"] = 0] = "NoConflict";
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["NonceCollision"] = 1] = "NonceCollision";
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["Error"] = 2] = "Error";
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["CoinbasePayment"] = 3] = "CoinbasePayment";
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["GasUsed"] = 4] = "GasUsed";
    FlashbotsBundleConflictType[FlashbotsBundleConflictType["NoBundlesInBlock"] = 5] = "NoBundlesInBlock";
})(FlashbotsBundleConflictType || (exports.FlashbotsBundleConflictType = FlashbotsBundleConflictType = {}));
const TIMEOUT_MS = 5 * 60 * 1000;
class FlashbotsBundleProvider extends ethers_1.JsonRpcProvider {
    constructor(genericProvider, authSigner, connectionInfoOrUrl, network) {
        super(connectionInfoOrUrl, network);
        this.genericProvider = genericProvider;
        this.authSigner = authSigner;
        this.connectionInfo = connectionInfoOrUrl;
    }
    static throttleCallback() {
        return __awaiter(this, void 0, void 0, function* () {
            console.warn("Rate limited");
            return false;
        });
    }
    /**
     * Creates a new Flashbots provider.
     * @param genericProvider ethers.js mainnet provider
     * @param authSigner account to sign bundles
     * @param connectionInfoOrUrl (optional) connection settings
     * @param network (optional) network settings
     *
     * @example
     * ```typescript
     * const {providers, Wallet} = require("ethers")
     * const {FlashbotsBundleProvider} = require("@flashbots/ethers-provider-bundle")
     * const authSigner = Wallet.createRandom()
     * const provider = new providers.JsonRpcProvider("http://localhost:8545")
     * const fbProvider = await FlashbotsBundleProvider.create(provider, authSigner)
     * ```
     */
    static create(genericProvider, authSigner, connectionInfoOrUrl, network) {
        return __awaiter(this, void 0, void 0, function* () {
            const connectionInfo = typeof connectionInfoOrUrl === "string" ||
                typeof connectionInfoOrUrl === "undefined"
                ? {
                    url: connectionInfoOrUrl || exports.DEFAULT_FLASHBOTS_RELAY,
                }
                : Object.assign({}, connectionInfoOrUrl);
            if (connectionInfo.headers === undefined)
                connectionInfo.headers = {};
            connectionInfo.throttleCallback = FlashbotsBundleProvider.throttleCallback;
            const networkish = {
                chainId: 0,
                name: "",
            };
            if (typeof network === "string") {
                networkish.name = network;
            }
            else if (typeof network === "number") {
                networkish.chainId = network;
            }
            else if (typeof network === "object") {
                networkish.name = network.name;
                networkish.chainId = network.chainId;
            }
            if (networkish.chainId === 0) {
                networkish.chainId = Number((yield genericProvider.getNetwork()).chainId);
            }
            if (Object(connectionInfo) === connectionInfo)
                connectionInfo.clone = function () {
                    const result = Object.assign({}, this);
                    result.clone = this.clone;
                    return result;
                };
            return new FlashbotsBundleProvider(genericProvider, authSigner, connectionInfo, networkish);
        });
    }
    /**
     * Calculates maximum base fee in a future block.
     * @param baseFee current base fee
     * @param blocksInFuture number of blocks in the future
     */
    static getMaxBaseFeeInFutureBlock(baseFee, blocksInFuture) {
        let maxBaseFee = BigInt(baseFee);
        for (let i = 0; i < blocksInFuture; i++) {
            maxBaseFee = (maxBaseFee * BigInt(1125)) / BigInt(1000) + BigInt(1);
        }
        return maxBaseFee;
    }
    /**
     * Calculates base fee for the next block.
     * @param currentBaseFeePerGas base fee of current block (wei)
     * @param currentGasUsed gas used by tx in simulation
     * @param currentGasLimit gas limit of transaction
     */
    static getBaseFeeInNextBlock(currentBaseFeePerGas, currentGasUsed, currentGasLimit) {
        const currentGasTarget = BigInt(currentGasLimit) / BigInt(2);
        if (BigInt(currentGasUsed) === BigInt(currentGasTarget)) {
            return currentBaseFeePerGas;
        }
        else if (BigInt(currentGasUsed) > BigInt(currentGasTarget)) {
            const gasUsedDelta = BigInt(currentGasUsed) - BigInt(currentGasTarget);
            const baseFeePerGasDelta = (BigInt(currentBaseFeePerGas) * BigInt(gasUsedDelta)) /
                BigInt(currentGasTarget) /
                BigInt(exports.BASE_FEE_MAX_CHANGE_DENOMINATOR);
            return currentBaseFeePerGas + BigInt(baseFeePerGasDelta);
        }
        else {
            const gasUsedDelta = currentGasTarget - BigInt(currentGasUsed);
            const baseFeePerGasDelta = BigInt((currentBaseFeePerGas * BigInt(gasUsedDelta)) /
                BigInt(currentGasTarget)) / BigInt(exports.BASE_FEE_MAX_CHANGE_DENOMINATOR);
            return BigInt(currentBaseFeePerGas) - BigInt(baseFeePerGasDelta);
        }
    }
    /**
     * Calculates a bundle hash locally.
     * @param txHashes hashes of transactions in the bundle
     */
    static generateBundleHash(txHashes) {
        const concatenatedHashes = txHashes
            .map((txHash) => txHash.slice(2))
            .join("");
        return (0, ethers_1.keccak256)(`0x${concatenatedHashes}`);
    }
    /**
     * Sends a signed flashbots bundle to Flashbots Relay.
     * @param signedBundledTransactions array of raw signed transactions
     * @param targetBlockNumber block to target for bundle inclusion
     * @param opts (optional) settings
     * @returns callbacks for handling results, and the bundle hash
     *
     * @example
     * ```typescript
     * const bundle: Array<FlashbotsBundleRawTransaction> = [
     *    {signedTransaction: "0x02..."},
     *    {signedTransaction: "0x02..."},
     * ]
     * const signedBundle = await fbProvider.signBundle(bundle)
     * const blockNum = await provider.getBlockNumber()
     * const bundleRes = await fbProvider.sendRawBundle(signedBundle, blockNum + 1)
     * const success = (await bundleRes.wait()) === FlashbotsBundleResolution.BundleIncluded
     * ```
     */
    sendRawBundle(signedBundledTransactions, targetBlockNumber, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                txs: signedBundledTransactions,
                blockNumber: `0x${targetBlockNumber.toString(16)}`,
                minTimestamp: opts === null || opts === void 0 ? void 0 : opts.minTimestamp,
                maxTimestamp: opts === null || opts === void 0 ? void 0 : opts.maxTimestamp,
                revertingTxHashes: opts === null || opts === void 0 ? void 0 : opts.revertingTxHashes,
                replacementUuid: opts === null || opts === void 0 ? void 0 : opts.replacementUuid,
            };
            const request = JSON.stringify(this.prepareRelayRequest("eth_sendBundle", [params]));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            const bundleTransactions = signedBundledTransactions.map((signedTransaction) => {
                const transactionDetails = ethers_1.Transaction.from(signedTransaction);
                return {
                    signedTransaction,
                    hash: (0, ethers_1.keccak256)(signedTransaction),
                    account: transactionDetails.from || "0x0",
                    nonce: transactionDetails.nonce,
                };
            });
            return {
                bundleTransactions,
                wait: () => this.waitForBundleInclusion(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
                simulate: () => this.simulate(bundleTransactions.map((tx) => tx.signedTransaction), targetBlockNumber, undefined, opts === null || opts === void 0 ? void 0 : opts.minTimestamp),
                receipts: () => this.fetchReceipts(bundleTransactions),
                bundleHash: response.result.bundleHash,
            };
        });
    }
    /**
     * Sends a bundle to Flashbots, supports multiple transaction interfaces.
     * @param bundledTransactions array of transactions, either signed or provided with a signer.
     * @param targetBlockNumber block to target for bundle inclusion
     * @param opts (optional) settings
     * @returns callbacks for handling results, and the bundle hash
     */
    sendBundle(bundledTransactions, targetBlockNumber, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const signedTransactions = yield this.signBundle(bundledTransactions);
            const res = yield this.simulate(signedTransactions, targetBlockNumber);
            if (res.error)
                throw new Error(res.error);
            return this.sendRawBundle(signedTransactions, targetBlockNumber, opts);
        });
    }
    /** Cancel any bundles submitted with the given `replacementUuid`
     * @param replacementUuid specified in `sendBundle`
     * @returns bundle hashes of the cancelled bundles
     */
    cancelBundles(replacementUuid) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                replacementUuid: replacementUuid,
            };
            const request = JSON.stringify(this.prepareRelayRequest("eth_cancelBundle", [params]));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return {
                bundleHashes: response.result,
            };
        });
    }
    /**
     * Sends a single private transaction to Flashbots.
     * @param transaction transaction, either signed or provided with a signer
     * @param opts (optional) settings
     * @returns callbacks for handling results, and transaction data
     *
     * @example
     * ```typescript
     * const tx: FlashbotsBundleRawTransaction = {signedTransaction: "0x02..."}
     * const blockNum = await provider.getBlockNumber()
     * // try sending for 5 blocks
     * const response = await fbProvider.sendPrivateTransaction(tx, {maxBlockNumber: blockNum + 5})
     * const success = (await response.wait()) === FlashbotsTransactionResolution.TransactionIncluded
     * ```
     */
    sendPrivateTransaction(transaction, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const startBlockNumberPromise = this.genericProvider.getBlockNumber();
            let signedTransaction;
            if ("signedTransaction" in transaction) {
                signedTransaction = transaction.signedTransaction;
            }
            else {
                signedTransaction = yield transaction.signer.signTransaction(transaction.transaction);
            }
            const params = {
                tx: signedTransaction,
                maxBlockNumber: opts === null || opts === void 0 ? void 0 : opts.maxBlockNumber,
            };
            const request = JSON.stringify(this.prepareRelayRequest("eth_sendPrivateTransaction", [params]));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            const transactionDetails = ethers_1.Transaction.from(signedTransaction);
            const privateTransaction = {
                signedTransaction: signedTransaction,
                hash: (0, ethers_1.keccak256)(signedTransaction),
                account: transactionDetails.from || "0x0",
                nonce: transactionDetails.nonce,
            };
            const startBlockNumber = yield startBlockNumberPromise;
            return {
                transaction: privateTransaction,
                wait: () => this.waitForTxInclusion(privateTransaction.hash, (opts === null || opts === void 0 ? void 0 : opts.maxBlockNumber) || startBlockNumber + 25, TIMEOUT_MS),
                simulate: () => this.simulate([privateTransaction.signedTransaction], startBlockNumber, undefined, opts === null || opts === void 0 ? void 0 : opts.simulationTimestamp),
                receipts: () => this.fetchReceipts([privateTransaction]),
            };
        });
    }
    /**
     * Attempts to cancel a pending private transaction.
     *
     * **_Note_**: This function removes the transaction from the Flashbots
     * bundler, but miners may still include it if they have received it already.
     * @param txHash transaction hash corresponding to pending tx
     * @returns true if transaction was cancelled successfully
     *
     * @example
     * ```typescript
     * const pendingTxHash = (await fbProvider.sendPrivateTransaction(tx)).transaction.hash
     * const isTxCanceled = await fbProvider.cancelPrivateTransaction(pendingTxHash)
     * ```
     */
    cancelPrivateTransaction(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                txHash,
            };
            const request = JSON.stringify(this.prepareRelayRequest("eth_cancelPrivateTransaction", [params]));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return true;
        });
    }
    /**
     * Signs a Flashbots bundle with this provider's `authSigner` key.
     * @param bundledTransactions
     * @returns signed bundle
     *
     * @example
     * ```typescript
     * const bundle: Array<FlashbotsBundleRawTransaction> = [
     *    {signedTransaction: "0x02..."},
     *    {signedTransaction: "0x02..."},
     * ]
     * const signedBundle = await fbProvider.signBundle(bundle)
     * const blockNum = await provider.getBlockNumber()
     * const simResult = await fbProvider.simulate(signedBundle, blockNum + 1)
     * ```
     */
    signBundle(bundledTransactions) {
        return __awaiter(this, void 0, void 0, function* () {
            const nonces = {};
            const signedTransactions = new Array();
            for (const tx of bundledTransactions) {
                if (typeof tx === "string") {
                    signedTransactions.push(tx);
                    continue;
                }
                if ("signedTransaction" in tx) {
                    // in case someone is mixing pre-signed and signing transactions, decode to add to nonce object
                    const transactionDetails = ethers_1.Transaction.from(tx.signedTransaction);
                    if (transactionDetails.from === undefined)
                        throw new Error("Could not decode signed transaction");
                    nonces[transactionDetails.from] = BigInt(transactionDetails.nonce + 1);
                    signedTransactions.push(tx.signedTransaction);
                    continue;
                }
                const transaction = Object.assign({}, tx.transaction);
                const address = yield tx.signer.getAddress();
                if (typeof transaction.nonce === "string")
                    throw new Error("Bad nonce");
                const nonce = transaction.nonce !== undefined
                    ? transaction.nonce
                    : nonces[address] ||
                        BigInt(yield this.genericProvider.getTransactionCount(address, "latest"));
                nonces[address] = (ethers_1.ethers.toBigInt(Number(nonce)) + BigInt(1));
                if (transaction.nonce === undefined)
                    transaction.nonce = nonce;
                if ((transaction.type == null || transaction.type == 0) &&
                    transaction.gasPrice === undefined)
                    transaction.gasPrice = BigInt(0);
                if (transaction.gasLimit === undefined)
                    transaction.gasLimit = yield tx.signer.estimateGas(transaction); // TODO: Add target block number and timestamp when supported by geth
                signedTransactions.push((yield tx.signer.signTransaction(transaction)));
            }
            return signedTransactions;
        });
    }
    /**
     * Watches for a specific block to see if a bundle was included in it.
     * @param transactionAccountNonces bundle transactions
     * @param targetBlockNumber block number to check for bundle inclusion
     * @param timeout ms
     */
    waitForBundleInclusion(transactionAccountNonces, targetBlockNumber, timeout) {
        return new Promise((resolve, reject) => {
            let timer = null;
            let done = false;
            const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
                if (accountNonce.nonce > 0) {
                    if (!acc[accountNonce.account] ||
                        accountNonce.nonce < acc[accountNonce.account]) {
                        acc[accountNonce.account] = accountNonce.nonce;
                    }
                }
                return acc;
            }, {});
            const handler = (blockNumber) => __awaiter(this, void 0, void 0, function* () {
                if (blockNumber < targetBlockNumber) {
                    const noncesValid = yield Promise.all(Object.entries(minimumNonceByAccount).map(([account, nonce]) => __awaiter(this, void 0, void 0, function* () {
                        const transactionCount = yield this.genericProvider.getTransactionCount(account);
                        return nonce >= transactionCount;
                    })));
                    const allNoncesValid = noncesValid.every(Boolean);
                    if (allNoncesValid)
                        return;
                    // target block not yet reached, but nonce has become invalid
                    resolve(FlashbotsBundleResolution.AccountNonceTooHigh);
                }
                else {
                    const block = yield this.genericProvider.getBlock(targetBlockNumber);
                    // check bundle against block:
                    const blockTransactionsHash = {};
                    for (const bt of block.transactions) {
                        blockTransactionsHash[bt] = true;
                    }
                    const bundleIncluded = transactionAccountNonces.every((transaction) => blockTransactionsHash[transaction.hash]);
                    resolve(bundleIncluded
                        ? FlashbotsBundleResolution.BundleIncluded
                        : FlashbotsBundleResolution.BlockPassedWithoutInclusion);
                }
                if (timer) {
                    clearTimeout(timer);
                }
                if (done) {
                    return;
                }
                done = true;
                this.genericProvider.removeListener("block", handler);
            });
            this.genericProvider.on("block", handler);
            if (timeout > 0) {
                timer = setTimeout(() => {
                    if (done) {
                        return;
                    }
                    timer = null;
                    done = true;
                    this.genericProvider.removeListener("block", handler);
                    reject("Timed out");
                }, timeout);
                if (timer.unref) {
                    timer.unref();
                }
            }
        });
    }
    /**
     * Waits for a transaction to be included on-chain.
     * @param transactionHash
     * @param maxBlockNumber highest block number to check before stopping
     * @param timeout ms
     */
    waitForTxInclusion(transactionHash, maxBlockNumber, timeout) {
        return new Promise((resolve, reject) => {
            let timer = null;
            let done = false;
            // runs on new block event
            const handler = (blockNumber) => __awaiter(this, void 0, void 0, function* () {
                if (blockNumber <= maxBlockNumber) {
                    // check tx status on mainnet
                    const sentTxStatus = yield this.genericProvider.getTransaction(transactionHash);
                    if (sentTxStatus && Number(yield sentTxStatus.confirmations()) >= 1) {
                        resolve(FlashbotsTransactionResolution.TransactionIncluded);
                    }
                    else {
                        return;
                    }
                }
                else {
                    // tx not included in specified range, bail
                    this.genericProvider.removeListener("block", handler);
                    resolve(FlashbotsTransactionResolution.TransactionDropped);
                }
                if (timer) {
                    clearTimeout(timer);
                }
                if (done) {
                    return;
                }
                done = true;
                this.genericProvider.removeListener("block", handler);
            });
            this.genericProvider.on("block", handler);
            // time out if we've been trying for too long
            if (timeout > 0) {
                timer = setTimeout(() => {
                    if (done) {
                        return;
                    }
                    timer = null;
                    done = true;
                    this.genericProvider.removeListener("block", handler);
                    reject("Timed out");
                }, timeout);
                if (timer.unref) {
                    timer.unref();
                }
            }
        });
    }
    /**
     * Gets stats for provider instance's `authSigner` address.
     * @deprecated use {@link getUserStatsV2} instead.
     */
    getUserStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const blockDetails = yield this.genericProvider.getBlock("latest");
            const evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
            const params = [evmBlockNumber];
            const request = JSON.stringify(this.prepareRelayRequest("flashbots_getUserStats", params));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return response.result;
        });
    }
    /**
     * Gets stats for provider instance's `authSigner` address.
     */
    getUserStatsV2() {
        return __awaiter(this, void 0, void 0, function* () {
            const blockDetails = yield this.genericProvider.getBlock("latest");
            const evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
            const params = [{ blockNumber: evmBlockNumber }];
            const request = JSON.stringify(this.prepareRelayRequest("flashbots_getUserStatsV2", params));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return response.result;
        });
    }
    /**
     * Gets information about a specific bundle.
     * @param bundleHash hash of bundle to investigate
     * @param blockNumber block in which the bundle should be included
     * @deprecated use {@link getBundleStatsV2} instead.
     */
    getBundleStats(bundleHash, blockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const evmBlockNumber = `0x${blockNumber.toString(16)}`;
            const params = [{ bundleHash, blockNumber: evmBlockNumber }];
            const request = JSON.stringify(this.prepareRelayRequest("flashbots_getBundleStats", params));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return response.result;
        });
    }
    /**
     * Gets information about a specific bundle.
     * @param bundleHash hash of bundle to investigate
     * @param blockNumber block in which the bundle should be included
     */
    getBundleStatsV2(bundleHash, blockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const evmBlockNumber = `0x${blockNumber.toString(16)}`;
            const params = [{ bundleHash, blockNumber: evmBlockNumber }];
            const request = JSON.stringify(this.prepareRelayRequest("flashbots_getBundleStatsV2", params));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            return response.result;
        });
    }
    /**
     * Simluates a bundle on a given block.
     * @param signedBundledTransactions signed Flashbots bundle
     * @param blockTag block tag to simulate against, can use "latest"
     * @param stateBlockTag (optional) simulated block state tag
     * @param blockTimestamp (optional) simulated timestamp
     *
     * @example
     * ```typescript
     * const bundle: Array<FlashbotsBundleRawTransaction> = [
     *    {signedTransaction: "0x1..."},
     *    {signedTransaction: "0x2..."},
     * ]
     * const signedBundle = await fbProvider.signBundle(bundle)
     * const blockNum = await provider.getBlockNumber()
     * const simResult = await fbProvider.simulate(signedBundle, blockNum + 1)
     * ```
     */
    simulate(signedBundledTransactions, blockTag, stateBlockTag, blockTimestamp, coinbase) {
        return __awaiter(this, void 0, void 0, function* () {
            let evmBlockNumber;
            if (typeof blockTag === "number") {
                evmBlockNumber = `0x${blockTag.toString(16)}`;
            }
            else {
                const blockTagDetails = yield this.genericProvider.getBlock(blockTag);
                const blockDetails = blockTagDetails !== null
                    ? blockTagDetails
                    : yield this.genericProvider.getBlock("latest");
                evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
            }
            let evmBlockStateNumber;
            if (typeof stateBlockTag === "number") {
                evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`;
            }
            else if (!stateBlockTag) {
                evmBlockStateNumber = "latest";
            }
            else {
                evmBlockStateNumber = stateBlockTag;
            }
            const params = [
                {
                    txs: signedBundledTransactions,
                    blockNumber: evmBlockNumber,
                    stateBlockNumber: evmBlockStateNumber,
                    timestamp: blockTimestamp,
                    coinbase,
                },
            ];
            const request = JSON.stringify(this.prepareRelayRequest("eth_callBundle", params));
            const response = yield this.request(request);
            if (response.error !== undefined && response.error !== null) {
                return {
                    error: {
                        message: response.error.message,
                        code: response.error.code,
                    },
                };
            }
            const callResult = response.result;
            return {
                bundleGasPrice: BigInt(callResult.bundleGasPrice),
                bundleHash: callResult.bundleHash,
                coinbaseDiff: BigInt(callResult.coinbaseDiff),
                ethSentToCoinbase: BigInt(callResult.ethSentToCoinbase),
                gasFees: BigInt(callResult.gasFees),
                results: callResult.results,
                stateBlockNumber: callResult.stateBlockNumber,
                totalGasUsed: callResult.results.reduce((a, b) => a + b.gasUsed, 0),
                firstRevert: callResult.results.find((txSim) => "revert" in txSim || "error" in txSim),
            };
        });
    }
    calculateBundlePricing(bundleTransactions, baseFee) {
        const bundleGasPricing = bundleTransactions.reduce((acc, transactionDetail) => {
            // see: https://blocks.flashbots.net/ and https://github.com/flashbots/ethers-provider-flashbots-bundle/issues/62
            const gasUsed = "gas_used" in transactionDetail
                ? transactionDetail.gas_used
                : transactionDetail.gasUsed;
            const ethSentToCoinbase = "coinbase_transfer" in transactionDetail
                ? transactionDetail.coinbase_transfer
                : "ethSentToCoinbase" in transactionDetail
                    ? transactionDetail.ethSentToCoinbase
                    : BigInt(0);
            const totalMinerReward = "total_miner_reward" in transactionDetail
                ? BigInt(transactionDetail.total_miner_reward)
                : "coinbaseDiff" in transactionDetail
                    ? BigInt(transactionDetail.coinbaseDiff)
                    : BigInt(0);
            const priorityFeeReceivedByMiner = BigInt(totalMinerReward) - BigInt(ethSentToCoinbase);
            return {
                gasUsed: acc.gasUsed + gasUsed,
                gasFeesPaidBySearcher: BigInt(acc.gasFeesPaidBySearcher) +
                    BigInt(baseFee) * BigInt(gasUsed) +
                    BigInt(priorityFeeReceivedByMiner),
                priorityFeesReceivedByMiner: acc.priorityFeesReceivedByMiner +
                    BigInt(priorityFeeReceivedByMiner),
                ethSentToCoinbase: acc.ethSentToCoinbase + BigInt(ethSentToCoinbase),
            };
        }, {
            gasUsed: 0,
            gasFeesPaidBySearcher: BigInt(0),
            priorityFeesReceivedByMiner: BigInt(0),
            ethSentToCoinbase: BigInt(0),
        });
        const effectiveGasPriceToSearcher = bundleGasPricing.gasUsed > 0
            ? (BigInt(bundleGasPricing.ethSentToCoinbase) +
                BigInt(bundleGasPricing.gasFeesPaidBySearcher)) /
                BigInt(bundleGasPricing.gasUsed)
            : BigInt(0);
        const effectivePriorityFeeToMiner = bundleGasPricing.gasUsed > 0
            ? (BigInt(bundleGasPricing.ethSentToCoinbase) +
                BigInt(bundleGasPricing.priorityFeesReceivedByMiner)) /
                BigInt(bundleGasPricing.gasUsed)
            : BigInt(0);
        return Object.assign(Object.assign({}, bundleGasPricing), { txCount: bundleTransactions.length, effectiveGasPriceToSearcher,
            effectivePriorityFeeToMiner });
    }
    /**
     * Gets information about a conflicting bundle. Useful if you're competing
     * for well-known MEV and want to know why your bundle didn't land.
     * @param targetSignedBundledTransactions signed bundle
     * @param targetBlockNumber block in which bundle should be included
     * @returns conflict and gas price details
     */
    getConflictingBundle(targetSignedBundledTransactions, targetBlockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const baseFee = (yield this.genericProvider.getBlock(targetBlockNumber)).baseFeePerGas ||
                BigInt(0);
            const conflictDetails = yield this.getConflictingBundleWithoutGasPricing(targetSignedBundledTransactions, targetBlockNumber);
            return Object.assign(Object.assign({}, conflictDetails), { targetBundleGasPricing: this.calculateBundlePricing(conflictDetails.initialSimulation.results, baseFee), conflictingBundleGasPricing: conflictDetails.conflictingBundle.length > 0
                    ? this.calculateBundlePricing(conflictDetails.conflictingBundle, baseFee)
                    : undefined });
        });
    }
    /**
     * Gets information about a conflicting bundle. Useful if you're competing
     * for well-known MEV and want to know why your bundle didn't land.
     * @param targetSignedBundledTransactions signed bundle
     * @param targetBlockNumber block in which bundle should be included
     * @returns conflict details
     */
    getConflictingBundleWithoutGasPricing(targetSignedBundledTransactions, targetBlockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const [initialSimulation, competingBundles] = yield Promise.all([
                this.simulate(targetSignedBundledTransactions, targetBlockNumber, targetBlockNumber - 1),
                this.fetchBlocksApi(targetBlockNumber),
            ]);
            if (competingBundles.latest_block_number <= targetBlockNumber) {
                throw new Error("Blocks-api has not processed target block");
            }
            if ("error" in initialSimulation ||
                initialSimulation.firstRevert !== undefined) {
                throw new Error("Target bundle errors at top of block");
            }
            const blockDetails = competingBundles.blocks[0];
            if (blockDetails === undefined) {
                return {
                    initialSimulation,
                    conflictType: FlashbotsBundleConflictType.NoBundlesInBlock,
                    conflictingBundle: [],
                };
            }
            const bundleTransactions = blockDetails.transactions;
            const bundleCount = bundleTransactions[bundleTransactions.length - 1].bundle_index + 1;
            const signedPriorBundleTransactions = [];
            for (let currentBundleId = 0; currentBundleId < bundleCount; currentBundleId++) {
                const currentBundleTransactions = bundleTransactions.filter((bundleTransaction) => bundleTransaction.bundle_index === currentBundleId);
                const currentBundleSignedTxs = yield Promise.all(currentBundleTransactions.map((competitorBundleBlocksApiTx) => __awaiter(this, void 0, void 0, function* () {
                    const tx = Object.assign({}, (yield this.genericProvider.getTransaction(competitorBundleBlocksApiTx.transaction_hash)));
                    if (tx.signature.v !== undefined &&
                        tx.signature.r !== undefined &&
                        tx.signature.s !== undefined) {
                        if (tx.type === 2) {
                            delete tx.gasPrice;
                        }
                        const result = ethers_1.Transaction.from(Object.assign(Object.assign({}, tx), { signature: ethers_1.Signature.from({
                                v: tx.signature.v,
                                r: tx.signature.r,
                                s: tx.signature.s,
                            }) }));
                        return result;
                    }
                    throw new Error("Could not get raw tx");
                })));
                signedPriorBundleTransactions.push(...currentBundleSignedTxs);
                const competitorAndTargetBundleSimulation = yield this.simulate([...signedPriorBundleTransactions, ...targetSignedBundledTransactions], targetBlockNumber, targetBlockNumber - 1);
                if ("error" in competitorAndTargetBundleSimulation) {
                    if (competitorAndTargetBundleSimulation.error.message.startsWith("err: nonce too low:")) {
                        return {
                            conflictType: FlashbotsBundleConflictType.NonceCollision,
                            initialSimulation,
                            conflictingBundle: currentBundleTransactions,
                        };
                    }
                    throw new Error("Simulation error");
                }
                const targetSimulation = competitorAndTargetBundleSimulation.results.slice(-targetSignedBundledTransactions.length);
                for (let j = 0; j < targetSimulation.length; j++) {
                    const targetSimulationTx = targetSimulation[j];
                    const initialSimulationTx = initialSimulation.results[j];
                    if ("error" in targetSimulationTx || "error" in initialSimulationTx) {
                        if ("error" in targetSimulationTx != "error" in initialSimulationTx) {
                            return {
                                conflictType: FlashbotsBundleConflictType.Error,
                                initialSimulation,
                                conflictingBundle: currentBundleTransactions,
                            };
                        }
                        continue;
                    }
                    if (targetSimulationTx.ethSentToCoinbase !=
                        initialSimulationTx.ethSentToCoinbase) {
                        return {
                            conflictType: FlashbotsBundleConflictType.CoinbasePayment,
                            initialSimulation,
                            conflictingBundle: currentBundleTransactions,
                        };
                    }
                    if (targetSimulationTx.gasUsed != initialSimulation.results[j].gasUsed) {
                        return {
                            conflictType: FlashbotsBundleConflictType.GasUsed,
                            initialSimulation,
                            conflictingBundle: currentBundleTransactions,
                        };
                    }
                }
            }
            return {
                conflictType: FlashbotsBundleConflictType.NoConflict,
                initialSimulation,
                conflictingBundle: [],
            };
        });
    }
    /** Gets information about a block from Flashbots blocks API. */
    fetchBlocksApi(blockNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, web_1.fetchJson)(`https://blocks.flashbots.net/v1/blocks?block_number=${blockNumber}`);
        });
    }
    request(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const connectionInfo = Object.assign({}, this.connectionInfo);
            connectionInfo.headers = Object.assign({ "X-Flashbots-Signature": `${yield this.authSigner.getAddress()}:${yield this.authSigner.signMessage((0, ethers_1.id)(request))}` }, this.connectionInfo.headers);
            return (0, web_1.fetchJson)(connectionInfo, request);
        });
    }
    fetchReceipts(bundledTransactions) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all(bundledTransactions.map((bundledTransaction) => this.genericProvider.getTransactionReceipt(bundledTransaction.hash)));
        });
    }
    prepareRelayRequest(method, params) {
        return {
            method: method,
            params: params,
            id: this._nextId++,
            jsonrpc: "2.0",
        };
    }
}
exports.FlashbotsBundleProvider = FlashbotsBundleProvider;
//# sourceMappingURL=flashbots.js.map