export type ITokenProps = {
    asset: string;
    type: string;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
};
export declare const TOKENS: ITokenProps[];
export declare const ZKSYNC_TOKENS: {
    type: string;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
}[];
export declare const TOKENS_BY_ID: {
    "1": ITokenProps[];
    "324": {
        type: string;
        address: string;
        name: string;
        symbol: string;
        decimals: number;
    }[];
};
