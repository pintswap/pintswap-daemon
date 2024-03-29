import { BlockTag, TransactionReceipt, TransactionRequest } from "@ethersproject/abstract-provider";
import { Networkish } from "@ethersproject/networks";
import { ConnectionInfo } from "@ethersproject/web";
import { JsonRpcProvider, Provider, Signer } from "ethers";
export declare const DEFAULT_FLASHBOTS_RELAY = "https://relay.flashbots.net";
export declare const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8;
export declare enum FlashbotsBundleResolution {
    BundleIncluded = 0,
    BlockPassedWithoutInclusion = 1,
    AccountNonceTooHigh = 2
}
export declare enum FlashbotsTransactionResolution {
    TransactionIncluded = 0,
    TransactionDropped = 1
}
export declare enum FlashbotsBundleConflictType {
    NoConflict = 0,
    NonceCollision = 1,
    Error = 2,
    CoinbasePayment = 3,
    GasUsed = 4,
    NoBundlesInBlock = 5
}
export interface FlashbotsBundleRawTransaction {
    signedTransaction: string;
}
export interface FlashbotsBundleTransaction {
    transaction: TransactionRequest;
    signer: Signer;
}
export interface FlashbotsOptions {
    minTimestamp?: number;
    maxTimestamp?: number;
    revertingTxHashes?: Array<string>;
    replacementUuid?: string;
}
export interface TransactionAccountNonce {
    hash: string;
    signedTransaction: string;
    account: string;
    nonce: number;
}
export interface FlashbotsTransactionResponse {
    bundleTransactions: Array<TransactionAccountNonce>;
    wait: () => Promise<FlashbotsBundleResolution>;
    simulate: () => Promise<SimulationResponse>;
    receipts: () => Promise<Array<TransactionReceipt>>;
    bundleHash: string;
}
export interface FlashbotsPrivateTransactionResponse {
    transaction: TransactionAccountNonce;
    wait: () => Promise<FlashbotsTransactionResolution>;
    simulate: () => Promise<SimulationResponse>;
    receipts: () => Promise<Array<TransactionReceipt>>;
}
export interface TransactionSimulationBase {
    txHash: string;
    gasUsed: number;
    gasFees: string;
    gasPrice: string;
    toAddress: string;
    fromAddress: string;
    coinbaseDiff: string;
}
export interface TransactionSimulationSuccess extends TransactionSimulationBase {
    value: string;
    ethSentToCoinbase: string;
    coinbaseDiff: string;
}
export interface TransactionSimulationRevert extends TransactionSimulationBase {
    error: string;
    revert: string;
}
export type TransactionSimulation = TransactionSimulationSuccess | TransactionSimulationRevert;
export interface RelayResponseError {
    error: {
        message: string;
        code: number;
    };
}
export interface SimulationResponseSuccess {
    bundleGasPrice: bigint;
    bundleHash: string;
    coinbaseDiff: bigint;
    ethSentToCoinbase: bigint;
    gasFees: bigint;
    results: Array<TransactionSimulation>;
    totalGasUsed: number;
    stateBlockNumber: number;
    firstRevert?: TransactionSimulation;
}
export type SimulationResponse = SimulationResponseSuccess | RelayResponseError;
export type FlashbotsTransaction = FlashbotsTransactionResponse | RelayResponseError;
export type FlashbotsPrivateTransaction = FlashbotsPrivateTransactionResponse | RelayResponseError;
export interface GetUserStatsResponseSuccess {
    is_high_priority: boolean;
    all_time_miner_payments: string;
    all_time_gas_simulated: string;
    last_7d_miner_payments: string;
    last_7d_gas_simulated: string;
    last_1d_miner_payments: string;
    last_1d_gas_simulated: string;
}
export interface GetUserStatsResponseSuccessV2 {
    isHighPriority: boolean;
    allTimeValidatorPayments: string;
    allTimeGasSimulated: string;
    last7dValidatorPayments: string;
    last7dGasSimulated: string;
    last1dValidatorPayments: string;
    last1dGasSimulated: string;
}
export type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError;
export type GetUserStatsResponseV2 = GetUserStatsResponseSuccessV2 | RelayResponseError;
interface PubKeyTimestamp {
    pubkey: string;
    timestamp: string;
}
export interface GetBundleStatsResponseSuccess {
    isSimulated: boolean;
    isSentToMiners: boolean;
    isHighPriority: boolean;
    simulatedAt: string;
    submittedAt: string;
    sentToMinersAt: string;
    consideredByBuildersAt: Array<PubKeyTimestamp>;
    sealedByBuildersAt: Array<PubKeyTimestamp>;
}
export interface GetBundleStatsResponseSuccessV2 {
    isSimulated: boolean;
    isHighPriority: boolean;
    simulatedAt: string;
    receivedAt: string;
    consideredByBuildersAt: Array<PubKeyTimestamp>;
    sealedByBuildersAt: Array<PubKeyTimestamp>;
}
export type GetBundleStatsResponse = GetBundleStatsResponseSuccess | RelayResponseError;
export type GetBundleStatsResponseV2 = GetBundleStatsResponseSuccessV2 | RelayResponseError;
interface BlocksApiResponseTransactionDetails {
    transaction_hash: string;
    tx_index: number;
    bundle_type: "rogue" | "flashbots" | "mempool";
    bundle_index: number;
    block_number: number;
    eoa_address: string;
    to_address: string;
    gas_used: number;
    gas_price: string;
    coinbase_transfer: string;
    eth_sent_to_fee_recipient: string;
    total_miner_reward: string;
    fee_recipient_eth_diff: string;
}
interface BlocksApiResponseBlockDetails {
    block_number: number;
    fee_recipient: string;
    fee_recipient_eth_diff: string;
    miner_reward: string;
    miner: string;
    coinbase_transfers: string;
    eth_sent_to_fee_recipient: string;
    gas_used: number;
    gas_price: string;
    transactions: Array<BlocksApiResponseTransactionDetails>;
}
export interface BlocksApiResponse {
    latest_block_number: number;
    blocks: Array<BlocksApiResponseBlockDetails>;
}
export interface FlashbotsBundleConflict {
    conflictingBundle: Array<BlocksApiResponseTransactionDetails>;
    initialSimulation: SimulationResponseSuccess;
    conflictType: FlashbotsBundleConflictType;
}
export interface FlashbotsGasPricing {
    txCount: number;
    gasUsed: number;
    gasFeesPaidBySearcher: bigint;
    priorityFeesReceivedByMiner: bigint;
    ethSentToCoinbase: bigint;
    effectiveGasPriceToSearcher: bigint;
    effectivePriorityFeeToMiner: bigint;
}
export interface FlashbotsBundleConflictWithGasPricing extends FlashbotsBundleConflict {
    targetBundleGasPricing: FlashbotsGasPricing;
    conflictingBundleGasPricing?: FlashbotsGasPricing;
}
export interface FlashbotsCancelBidResponseSuccess {
    bundleHashes: string[];
}
export type FlashbotsCancelBidResponse = FlashbotsCancelBidResponseSuccess | RelayResponseError;
export declare class FlashbotsBundleProvider extends JsonRpcProvider {
    private genericProvider;
    private authSigner;
    private connectionInfo;
    private _nextId;
    constructor(genericProvider: Provider, authSigner: Signer, connectionInfoOrUrl: ConnectionInfo, network: Networkish);
    static throttleCallback(): Promise<boolean>;
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
    static create(genericProvider: Provider, authSigner: Signer, connectionInfoOrUrl?: ConnectionInfo | string, network?: Networkish): Promise<FlashbotsBundleProvider>;
    /**
     * Calculates maximum base fee in a future block.
     * @param baseFee current base fee
     * @param blocksInFuture number of blocks in the future
     */
    static getMaxBaseFeeInFutureBlock(baseFee: bigint, blocksInFuture: number): bigint;
    /**
     * Calculates base fee for the next block.
     * @param currentBaseFeePerGas base fee of current block (wei)
     * @param currentGasUsed gas used by tx in simulation
     * @param currentGasLimit gas limit of transaction
     */
    static getBaseFeeInNextBlock(currentBaseFeePerGas: bigint, currentGasUsed: bigint, currentGasLimit: bigint): bigint;
    /**
     * Calculates a bundle hash locally.
     * @param txHashes hashes of transactions in the bundle
     */
    static generateBundleHash(txHashes: Array<string>): string;
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
    sendRawBundle(signedBundledTransactions: Array<string>, targetBlockNumber: number, opts?: FlashbotsOptions): Promise<FlashbotsTransaction>;
    /**
     * Sends a bundle to Flashbots, supports multiple transaction interfaces.
     * @param bundledTransactions array of transactions, either signed or provided with a signer.
     * @param targetBlockNumber block to target for bundle inclusion
     * @param opts (optional) settings
     * @returns callbacks for handling results, and the bundle hash
     */
    sendBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>, targetBlockNumber: number, opts?: FlashbotsOptions): Promise<FlashbotsTransaction>;
    /** Cancel any bundles submitted with the given `replacementUuid`
     * @param replacementUuid specified in `sendBundle`
     * @returns bundle hashes of the cancelled bundles
     */
    cancelBundles(replacementUuid: string): Promise<FlashbotsCancelBidResponse>;
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
    sendPrivateTransaction(transaction: FlashbotsBundleTransaction | FlashbotsBundleRawTransaction, opts?: {
        maxBlockNumber?: number;
        simulationTimestamp?: number;
    }): Promise<FlashbotsPrivateTransaction>;
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
    cancelPrivateTransaction(txHash: string): Promise<boolean | RelayResponseError>;
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
    signBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>): Promise<Array<string>>;
    /**
     * Watches for a specific block to see if a bundle was included in it.
     * @param transactionAccountNonces bundle transactions
     * @param targetBlockNumber block number to check for bundle inclusion
     * @param timeout ms
     */
    private waitForBundleInclusion;
    /**
     * Waits for a transaction to be included on-chain.
     * @param transactionHash
     * @param maxBlockNumber highest block number to check before stopping
     * @param timeout ms
     */
    private waitForTxInclusion;
    /**
     * Gets stats for provider instance's `authSigner` address.
     * @deprecated use {@link getUserStatsV2} instead.
     */
    getUserStats(): Promise<GetUserStatsResponse>;
    /**
     * Gets stats for provider instance's `authSigner` address.
     */
    getUserStatsV2(): Promise<GetUserStatsResponseV2>;
    /**
     * Gets information about a specific bundle.
     * @param bundleHash hash of bundle to investigate
     * @param blockNumber block in which the bundle should be included
     * @deprecated use {@link getBundleStatsV2} instead.
     */
    getBundleStats(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponse>;
    /**
     * Gets information about a specific bundle.
     * @param bundleHash hash of bundle to investigate
     * @param blockNumber block in which the bundle should be included
     */
    getBundleStatsV2(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponseV2>;
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
    simulate(signedBundledTransactions: Array<string>, blockTag: BlockTag, stateBlockTag?: BlockTag, blockTimestamp?: number, coinbase?: string): Promise<SimulationResponse>;
    private calculateBundlePricing;
    /**
     * Gets information about a conflicting bundle. Useful if you're competing
     * for well-known MEV and want to know why your bundle didn't land.
     * @param targetSignedBundledTransactions signed bundle
     * @param targetBlockNumber block in which bundle should be included
     * @returns conflict and gas price details
     */
    getConflictingBundle(targetSignedBundledTransactions: Array<string>, targetBlockNumber: number): Promise<FlashbotsBundleConflictWithGasPricing>;
    /**
     * Gets information about a conflicting bundle. Useful if you're competing
     * for well-known MEV and want to know why your bundle didn't land.
     * @param targetSignedBundledTransactions signed bundle
     * @param targetBlockNumber block in which bundle should be included
     * @returns conflict details
     */
    getConflictingBundleWithoutGasPricing(targetSignedBundledTransactions: Array<string>, targetBlockNumber: number): Promise<FlashbotsBundleConflict>;
    /** Gets information about a block from Flashbots blocks API. */
    fetchBlocksApi(blockNumber: number): Promise<BlocksApiResponse>;
    private request;
    private fetchReceipts;
    private prepareRelayRequest;
}
export {};
