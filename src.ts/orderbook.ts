import { TOKENS } from './token-list';
import { ethers } from 'ethers';
import { keyBy, sortBy, groupBy } from "lodash";

const ETH: any = TOKENS.find((v) => v.symbol === 'ETH');
const USDC: any = TOKENS.find((v) => v.symbol === 'USDC');
const USDT: any = TOKENS.find((v) => v.symbol === 'USDT');
const DAI: any = TOKENS.find((v) => v.symbol === 'DAI');

export const decimalsCache: any = {};
export const symbolCache: any = {};

export const TOKENS_BY_SYMBOL = keyBy(TOKENS, 'symbol');


export function toAddress(symbolOrAddress: string): string {
  const token = TOKENS_BY_SYMBOL[symbolOrAddress];
  if (token) return ethers.getAddress(token.address);
  return ethers.getAddress(symbolOrAddress);
}

export async function toTicker(pair: any, provider: any) {
    const flipped = [...pair].reverse();
    return (
        await Promise.all(
            flipped.map(async (v: any) => await getSymbol(v.address, provider)),
        )
    ).join('/');
}

export async function getSymbol(address: any, provider: any) {
    address = ethers.getAddress(address);
    const match = TOKENS.find((v) => ethers.getAddress(v.address) === address);
    if (match) return match.symbol;
    else if (symbolCache[address]) {
        return symbolCache[address];
    } else {
        const contract = new ethers.Contract(
            address,
            ['function symbol() view returns (string)'],
            provider,
        );
        try {
            symbolCache[address] = await contract.symbol();
        } catch (e) {
            symbolCache[address] = address;
        }
        return symbolCache[address];
    }
}

function givesBase(offer: any) {
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
function givesTrade(offer: any) {
    return { pair: givesBase(offer).pair.reverse(), type: 'ask' };
}

export const sortBids = (orders: any) => {
    return orders.slice().sort((a: any, b: any) => {
        return Number(a.price) - Number(b.price);
    });
};

export const sortAsks = (orders: any) => {
    return orders.slice().sort((a: any, b: any) => {
        return Number(b.price) - Number(a.price);
    });
};

export const sortLimitOrders = (limitOrders: any) => {
    return Object.values(groupBy(limitOrders, 'ticker'))
        .map((v: any) => {
            const { bid, ask } = groupBy(v, 'type');
            return sortAsks(ask).concat(sortBids(bid));
        })
        .reduce((r, v) => r.concat(v), []);
};

export async function getDecimals(address: any, provider: any) {
    address = ethers.getAddress(address);
    const match = TOKENS.find((v) => ethers.getAddress(v.address) === address);
    if (match) return match.decimals;
    else if (decimalsCache[address]) {
        return decimalsCache[address];
    } else {
        const contract = new ethers.Contract(
            address,
            ['function decimals() view returns (uint8)'],
            provider,
        );
        decimalsCache[address] = Number(await contract.decimals());
        return decimalsCache[address];
    }
}

export function orderTokens(offer: any) {
    const mapped = {
        ...offer,
        givesToken: toAddress(offer.givesToken),
        getsToken: toAddress(offer.getsToken),
    };
    if (mapped.givesToken === USDC.address) {
        return givesBase(mapped);
    } else if (mapped.getsToken === USDC.address) {
        return givesTrade(mapped);
    } else if (mapped.givesToken === USDT.address) {
        return givesBase(mapped);
    } else if (mapped.getsToken === USDT.address) {
        return givesTrade(mapped);
    } else if (mapped.givesToken === DAI.address) {
        return givesBase(mapped);
    } else if (mapped.getsToken === DAI.address) {
        return givesTrade(mapped);
    } else if (mapped.givesToken === ETH.address) {
        return givesBase(mapped);
    } else if (mapped.getsToken === ETH.address) {
        return givesTrade(mapped);
    } else if (Number(mapped.givesToken.toLowerCase()) < Number(mapped.getsToken.toLowerCase())) {
        return givesBase(mapped);
    } else return givesTrade(mapped);
}

export async function fromFormatted(trade: any, provider: any) {
  const [ givesToken, getsToken ] = [trade.givesToken, trade.getsToken].map((v) => toAddress(v));
  return {
    givesToken,
    getsToken,
    givesAmount: ethers.toBeHex(ethers.parseUnits(trade.givesAmount, await getDecimals(givesToken, provider))),
    getsAmount: ethers.toBeHex(ethers.parseUnits(trade.getsAmount, await getDecimals(getsToken, provider)))
  };
}

export async function fromLimitOrder({
  price,
  amount,
  type,
  pair
}, provider) {
  const [ trade, base ] = pair.split('/').map(toAddress);
  const [ tradeDecimals, baseDecimals ] = await Promise.all([ trade, base ].map(async (v) => await getDecimals(v, provider)));
  if (type === 'buy') {
    return {
      getsToken: trade,
      givesToken: base,
      getsAmount: ethers.toBeHex(BigInt(Number(amount)*(10**tradeDecimals))),
      givesAmount: ethers.toBeHex(BigInt(Number(amount)*(10**tradeDecimals)/(Number(price)*(10**baseDecimals))))
    };
  }
  return {
    getsToken: base,
    givesToken: trade,
    givesAmount: ethers.toBeHex(Number(amount)*(10**tradeDecimals)),
    getsAmount: ethers.toBeHex(BigInt(Number(amount)*(10**tradeDecimals)/Number(price)*(10**baseDecimals)))
  };
}

export async function toLimitOrder(offer: any, provider: any) {
    const {
        pair: [base, trade],
        type,
    } = orderTokens(offer);
    const [baseDecimals, tradeDecimals] = await Promise.all(
        [base, trade].map(async (v) => await getDecimals(v.address, provider)),
    );
    return {
        price: (
            Number(ethers.formatUnits(base.amount, baseDecimals)) /
            Number(ethers.formatUnits(trade.amount, tradeDecimals))
        ).toFixed(4),
        amount: ethers.formatUnits(trade.amount, tradeDecimals),
        type,
        ticker: await toTicker([base, trade], provider),
    };
}
