export declare const logger: import("winston").Logger;
export declare function uriFromEnv(): string;
export declare function optionsFromArgv(): {
    command: any;
    options: {};
};
export declare function runCLI(): Promise<void>;
