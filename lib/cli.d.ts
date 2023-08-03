export declare const logger: any;
export declare const daemonLogger: any;
export declare const SUBSTITUTIONS: {
    ETH: string;
};
export declare function uriFromEnv(): string;
export declare function toWsUri(uri: any): string;
export declare function maybeSubstitute(v: any): any;
export declare function optionsFromArgv(): {
    command: any;
    options: {};
};
export declare function runCLI(): Promise<void>;
