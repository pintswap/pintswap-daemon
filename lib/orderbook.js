"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLimitOrder = exports.fromLimitOrder = exports.fromFormatted = exports.orderTokens = exports.getDecimals = exports.sortLimitOrders = exports.sortAsks = exports.sortBids = exports.getSymbol = exports.toTicker = exports.toAddress = exports.TOKENS_BY_SYMBOL = exports.symbolCache = exports.decimalsCache = void 0;
const token_list_1 = require("./token-list");
const ethers_1 = require("ethers");
const lodash_1 = require("lodash");
const ETH = token_list_1.TOKENS.find((v) => v.symbol === 'ETH');
const USDC = token_list_1.TOKENS.find((v) => v.symbol === 'USDC');
const USDT = token_list_1.TOKENS.find((v) => v.symbol === 'USDT');
const DAI = token_list_1.TOKENS.find((v) => v.symbol === 'DAI');
exports.decimalsCache = {};
exports.symbolCache = {};
exports.TOKENS_BY_SYMBOL = (0, lodash_1.keyBy)(token_list_1.TOKENS, 'symbol');
function toAddress(symbolOrAddress) {
    const token = exports.TOKENS_BY_SYMBOL[symbolOrAddress];
    if (token)
        return ethers_1.ethers.getAddress(token.address);
    return ethers_1.ethers.getAddress(symbolOrAddress);
}
exports.toAddress = toAddress;
function toTicker(pair, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const flipped = [...pair].reverse();
        return (yield Promise.all(flipped.map((v) => __awaiter(this, void 0, void 0, function* () { return yield getSymbol(v.address, provider); })))).join('/');
    });
}
exports.toTicker = toTicker;
function getSymbol(address, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        address = ethers_1.ethers.getAddress(address);
        const match = token_list_1.TOKENS.find((v) => ethers_1.ethers.getAddress(v.address) === address);
        if (match)
            return match.symbol;
        else if (exports.symbolCache[address]) {
            return exports.symbolCache[address];
        }
        else {
            const contract = new ethers_1.ethers.Contract(address, ['function symbol() view returns (string)'], provider);
            try {
                exports.symbolCache[address] = yield contract.symbol();
            }
            catch (e) {
                exports.symbolCache[address] = address;
            }
            return exports.symbolCache[address];
        }
    });
}
exports.getSymbol = getSymbol;
function givesBase(offer) {
    return {
        pair: [
            {
                amount: offer.givesAmount,
                address: offer.givesToken,
            },
            {
                amount: offer.getsAmount,
                address: offer.getsToken,
            },
        ],
        type: 'bid',
    };
}
function givesTrade(offer) {
    return { pair: givesBase(offer).pair.reverse(), type: 'ask' };
}
const sortBids = (orders) => {
    return orders.slice().sort((a, b) => {
        return Number(a.price) - Number(b.price);
    });
};
exports.sortBids = sortBids;
const sortAsks = (orders) => {
    return orders.slice().sort((a, b) => {
        return Number(b.price) - Number(a.price);
    });
};
exports.sortAsks = sortAsks;
const sortLimitOrders = (limitOrders) => {
    return Object.values((0, lodash_1.groupBy)(limitOrders, 'ticker'))
        .map((v) => {
        const { bid, ask } = (0, lodash_1.groupBy)(v, 'type');
        return (0, exports.sortAsks)(ask).concat((0, exports.sortBids)(bid));
    })
        .reduce((r, v) => r.concat(v), []);
};
exports.sortLimitOrders = sortLimitOrders;
function getDecimals(address, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        address = ethers_1.ethers.getAddress(address);
        const match = token_list_1.TOKENS.find((v) => ethers_1.ethers.getAddress(v.address) === address);
        if (match)
            return match.decimals;
        else if (exports.decimalsCache[address]) {
            return exports.decimalsCache[address];
        }
        else {
            const contract = new ethers_1.ethers.Contract(address, ['function decimals() view returns (uint8)'], provider);
            exports.decimalsCache[address] = Number(yield contract.decimals());
            return exports.decimalsCache[address];
        }
    });
}
exports.getDecimals = getDecimals;
function orderTokens(offer) {
    const mapped = Object.assign(Object.assign({}, offer), { givesToken: toAddress(offer.givesToken), getsToken: toAddress(offer.getsToken) });
    if (mapped.givesToken === USDC.address) {
        return givesBase(mapped);
    }
    else if (mapped.getsToken === USDC.address) {
        return givesTrade(mapped);
    }
    else if (mapped.givesToken === USDT.address) {
        return givesBase(mapped);
    }
    else if (mapped.getsToken === USDT.address) {
        return givesTrade(mapped);
    }
    else if (mapped.givesToken === DAI.address) {
        return givesBase(mapped);
    }
    else if (mapped.getsToken === DAI.address) {
        return givesTrade(mapped);
    }
    else if (mapped.givesToken === ETH.address) {
        return givesBase(mapped);
    }
    else if (mapped.getsToken === ETH.address) {
        return givesTrade(mapped);
    }
    else if (Number(mapped.givesToken.toLowerCase()) < Number(mapped.getsToken.toLowerCase())) {
        return givesBase(mapped);
    }
    else
        return givesTrade(mapped);
}
exports.orderTokens = orderTokens;
function fromFormatted(trade, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const [givesToken, getsToken] = [trade.givesToken, trade.getsToken].map((v) => toAddress(v));
        return {
            givesToken,
            getsToken,
            givesAmount: ethers_1.ethers.toBeHex(ethers_1.ethers.parseUnits(trade.givesAmount, yield getDecimals(givesToken, provider))),
            getsAmount: ethers_1.ethers.toBeHex(ethers_1.ethers.parseUnits(trade.getsAmount, yield getDecimals(getsToken, provider)))
        };
    });
}
exports.fromFormatted = fromFormatted;
function fromLimitOrder({ price, amount, type, pair }, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const [trade, base] = pair.split('/').map(toAddress);
        const [tradeDecimals, baseDecimals] = yield Promise.all([trade, base].map((v) => __awaiter(this, void 0, void 0, function* () { return yield getDecimals(v, provider); })));
        if (type === 'buy') {
            return {
                getsToken: trade,
                givesToken: base,
                getsAmount: ethers_1.ethers.toBeHex(BigInt(Number(amount) * (Math.pow(10, tradeDecimals)))),
                givesAmount: ethers_1.ethers.toBeHex(BigInt(Number(amount) * (Math.pow(10, tradeDecimals)) / (Number(price) * (Math.pow(10, baseDecimals)))))
            };
        }
        return {
            getsToken: base,
            givesToken: trade,
            givesAmount: ethers_1.ethers.toBeHex(Number(amount) * (Math.pow(10, tradeDecimals))),
            getsAmount: ethers_1.ethers.toBeHex(BigInt(Number(amount) * (Math.pow(10, tradeDecimals)) / Number(price) * (Math.pow(10, baseDecimals))))
        };
    });
}
exports.fromLimitOrder = fromLimitOrder;
function toLimitOrder(offer, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const { pair: [base, trade], type, } = orderTokens(offer);
        const [baseDecimals, tradeDecimals] = yield Promise.all([base, trade].map((v) => __awaiter(this, void 0, void 0, function* () { return yield getDecimals(v.address, provider); })));
        return {
            price: (Number(ethers_1.ethers.formatUnits(base.amount, baseDecimals)) /
                Number(ethers_1.ethers.formatUnits(trade.amount, tradeDecimals))).toFixed(4),
            amount: ethers_1.ethers.formatUnits(trade.amount, tradeDecimals),
            type,
            ticker: yield toTicker([base, trade], provider),
        };
    });
}
exports.toLimitOrder = toLimitOrder;
//# sourceMappingURL=orderbook.js.map