/// <reference types="node" />
/// <reference types="node" />
import { createLogger } from "@pintswap/sdk/lib/logger";
import { ethers } from "ethers";
import PeerId from "peer-id";
import { ZkSyncProvider } from "ethers-v6-zksync-compat";
import { createServer } from "http";
export declare function signBundle(signer: any, body: any): Promise<string>;
export declare const timeout: (n: any) => Promise<unknown>;
export declare function waitForBlock(provider: any, number: any): Promise<any>;
export declare function sendBundle(logger: any, flashbots: any, txs: any, blockNumber: any): any;
export declare function providerFromChainId(chainId: any): ethers.InfuraProvider | ZkSyncProvider;
export declare function toProvider(p: any): any;
export declare const logger: any;
export declare const broadcast: (wsServer: WebSocketServer, msg: any) => void;
export declare const bindLogger: (logger: ReturnType<typeof createLogger>, wsServer: WebSocketServer) => void;
export declare function walletFromEnv(): ethers.Wallet | ethers.HDNodeWallet;
export declare function providerFromEnv(): ethers.InfuraProvider | ZkSyncProvider;
export declare const PINTSWAP_DIRECTORY: string;
export declare const PINTSWAP_PEERID_FILEPATH: string;
export declare function loadOrCreatePeerId(): Promise<PeerId>;
export declare function runServer(server: ReturnType<typeof createServer>): Promise<void>;
export declare function expandValues([token, amount, tokenId]: [any, any, any], provider: any): Promise<any[]>;
export declare function expandOffer(offer: any, provider: any): Promise<{
    givesToken: any;
    givesAmount: any;
    givesTokenId: any;
    getsToken: any;
    getsAmount: any;
    getsTokenId: any;
}>;
export declare const PINTSWAP_DATA_FILEPATH: string;
export declare function saveData(pintswap: any): Promise<void>;
export declare function loadData(): Promise<{
    userData: {
        bio: any;
        image: Buffer;
    };
    offers: Map<unknown, unknown>;
}>;
export declare function run(): Promise<void>;
