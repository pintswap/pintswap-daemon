export declare function waitForBlock(provider: any, number: any): Promise<any>;
export declare function camelCase(s: string): string;
export declare const timeout: (n: any) => Promise<unknown>;
export declare function sendBundle(logger: any, flashbots: any, txs: any, blockNumber: any): any;
export declare function callBundle(logger: any, flashbots: any, txs: any, blockNumber: any): Promise<import("./flashbots").SimulationResponse>;
