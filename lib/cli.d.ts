export declare const logger: import("winston").Logger;
export declare const SUBSTITUTIONS: {
    ETH: string;
};
export declare function uriFromEnv(): string;
export declare function maybeSubstitute(v: any): any;
export declare function optionsFromArgv(): {
    command: any;
    options: {};
};
export declare function runCLI(): Promise<void>;
