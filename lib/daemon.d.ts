/// <reference types="node" />
/// <reference types="node" />
import express from "express";
import { ethers } from "ethers";
import { Pintswap } from "@pintswap/sdk";
import PeerId from "peer-id";
import { ZkSyncProvider } from "ethers-v6-zksync-compat";
import { createServer } from "http";
import { WebSocketServer } from "ws";
type Handler = (req: any, res: any) => void;
export declare function signBundle(signer: any, body: any): Promise<string>;
export declare function providerFromChainId(chainId: any): ethers.InfuraProvider | ZkSyncProvider;
export declare function toProvider(p: any): any;
export declare const logger: any;
export declare function walletFromEnv(): ethers.Wallet | ethers.HDNodeWallet;
export declare function providerFromEnv(): ethers.InfuraProvider | ZkSyncProvider;
export declare const PINTSWAP_DIRECTORY: string;
export declare const PINTSWAP_PEERID_FILEPATH: string;
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
export declare class PintswapDaemon {
    static PINTSWAP_DATA_FILEPATH: string;
    static PINTSWAP_DIRECTORY: string;
    static PINTSWAP_PEERID_FILEPATH: string;
    wallet: ethers.Wallet;
    rpc: ReturnType<typeof express>;
    logger: typeof logger;
    pintswap: Pintswap;
    server: ReturnType<typeof createServer>;
    wsServer: WebSocketServer;
    handlers: ReturnType<typeof this.createHandlers>;
    broadcast(msg: any): Promise<void>;
    runServer(): Promise<void>;
    saveData(): Promise<void>;
    loadData(): Promise<{
        userData: {
            bio: any;
            image: Buffer;
        };
        offers: Map<unknown, unknown>;
    }>;
    get flashbots(): {
        provider: ethers.Provider;
        authSigner: ethers.Wallet;
    };
    constructor();
    static create(): Promise<PintswapDaemon>;
    start(): Promise<void>;
    loadOrCreatePeerId(): Promise<PeerId>;
    bindMiddleware(): void;
    instantiatePintswap(): Promise<void>;
    initializePintswap(): Promise<void>;
    bindLogger(): void;
    createHandlers(): {
        post: {
            peer: Handler;
            resolve: Handler;
            publish: Handler;
            publishOnce: Handler;
            orderbook: Handler;
            peerImage: (req: any, res: any) => void;
            subscribe: (req: any, res: any) => void;
            trade: Handler;
            unsubscribe: Handler;
            quiet: Handler;
            add: Handler;
            limit: Handler;
            register: Handler;
            address: Handler;
            ethereumAddress: Handler;
            setBio: Handler;
            setImage: Handler;
            offers: Handler;
            del: Handler;
            clear: Handler;
            userData: Handler;
        };
    };
    bindRoutes(): void;
}
export {};
