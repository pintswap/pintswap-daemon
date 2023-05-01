/// <reference types="node" />
import express from "express";
import { ethers } from "ethers";
import PeerId from "peer-id";
import { ZkSyncProvider } from "ethers-v6-zksync-compat";
export declare function providerFromChainId(chainId: any): ethers.InfuraProvider | ZkSyncProvider;
export declare const logger: any;
export declare function walletFromEnv(): ethers.Wallet | ethers.HDNodeWallet;
export declare function providerFromEnv(): ethers.InfuraProvider | ZkSyncProvider;
export declare const PINTSWAP_DIRECTORY: string;
export declare const PINTSWAP_PEERID_FILEPATH: string;
export declare function loadOrCreatePeerId(): Promise<PeerId>;
export declare function runServer(app: ReturnType<typeof express>): Promise<void>;
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
