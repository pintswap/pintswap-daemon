export declare const decimalsCache: any;
export declare const symbolCache: any;
export declare const TOKENS_BY_SYMBOL: any;
export declare function toAddress(symbolOrAddress: string): string;
export declare function toTicker(pair: any, provider: any): Promise<string>;
export declare function getSymbol(address: any, provider: any): Promise<any>;
export declare const sortBids: (orders: any) => any;
export declare const sortAsks: (orders: any) => any;
export declare const sortLimitOrders: (limitOrders: any) => any;
export declare function getDecimals(address: any, provider: any): Promise<any>;
export declare function orderTokens(offer: any): {
    pair: {
        amount: any;
        address: any;
    }[];
    type: string;
};
export declare function fromFormatted(trade: any, provider: any): Promise<{
    givesToken: string;
    getsToken: string;
    givesAmount: string;
    getsAmount: string;
}>;
export declare function fromLimitOrder({ price, amount, type, pair }: {
    price: any;
    amount: any;
    type: any;
    pair: any;
}, provider: any): Promise<{
    getsToken: any;
    givesToken: any;
    getsAmount: string;
    givesAmount: string;
}>;
export declare function toLimitOrder(offer: any, provider: any): Promise<{
    price: string;
    amount: string;
    type: string;
    ticker: string;
}>;
