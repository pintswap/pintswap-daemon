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
exports.packETHTransfers = exports.packPushZero = exports.pack = void 0;
const emasm_1 = require("emasm");
const ethers_1 = require("ethers");
function pack(signer, txs) {
    return __awaiter(this, void 0, void 0, function* () {
        let nonce = Number(yield signer.provider.getTransactionCount(yield signer.getAddress()));
        const { chainId } = yield signer.provider.getNetwork();
        const address = yield signer.getAddress();
        const packed = [];
        for (const v of txs) {
            const tx = ethers_1.ethers.Transaction.from(v);
            const o = ethers_1.ethers.Transaction.from(v).toJSON();
            const remap = ethers_1.Transaction.from(Object.assign(o, { signature: ethers_1.ethers.Signature.from(o.sig), nonce: (tx.from.toLowerCase() === address.toLowerCase() || (o.to === null && o.sig === null)) ? (nonce++) : o.nonce, chainId }));
            if (!Number(remap.signature.r) || tx.from.toLowerCase() === address.toLowerCase()) {
                packed.push(yield signer.signTransaction(remap.unsignedSerialized));
            }
            else
                packed.push(v);
        }
        packed.forEach((v) => {
            console.log(ethers_1.ethers.Transaction.from(v).toJSON());
        });
        return packed;
    });
}
exports.pack = pack;
function packPushZero(ary) {
    return _packPushZero(ary).ary;
}
exports.packPushZero = packPushZero;
function _packPushZero(ary, firstInstruction = true, noCalls = true, lastItemZero = false) {
    const result = ary.map((v) => {
        if (Array.isArray(v)) {
            const { ary: _ary, firstInstruction: _firstInstruction, noCalls: _noCalls, lastItemZero: _lastItemZero, } = _packPushZero(v, firstInstruction, noCalls, lastItemZero);
            firstInstruction = _firstInstruction;
            noCalls = _noCalls;
            lastItemZero = _lastItemZero;
            return _ary;
        }
        else if (!isNaN(v) && Number(v) === 0) {
            let op = firstInstruction ? 'pc' : noCalls ? 'returndatasize' : lastItemZero ? 'dup1' : '0x0';
            firstInstruction = false;
            lastItemZero = true;
            return op;
        }
        else {
            if (["call", "delegatecall", "staticcall", "callcode"].includes(v))
                noCalls = false;
        }
        firstInstruction = false;
        return v;
    });
    return {
        ary: result,
        firstInstruction,
        lastItemZero,
        noCalls,
    };
}
function packETHTransfers(signer, args) {
    return __awaiter(this, void 0, void 0, function* () {
        args = args.map((v) => ethers_1.Transaction.from(v));
        const valueTransfer = args.filter((v) => {
            if ([null, "0x"].includes(v.data))
                return true;
            return false;
        });
        const last = valueTransfer[valueTransfer.length - 1];
        const dataTransactions = args.filter((v) => {
            if (![null, "0x"].includes(v.data))
                return true;
            return false;
        });
        const value = ethers_1.ethers.toBeHex(valueTransfer.reduce((r, v) => ethers_1.ethers.getUint(v.value) + r, BigInt(0)));
        const valueTransferExceptLast = valueTransfer.slice(0, -1);
        const data = (0, emasm_1.emasm)(packPushZero([
            valueTransferExceptLast.map((v, i, ary) => [
                "0x0",
                "0x0",
                "0x0",
                "0x0",
                ethers_1.ethers.toBeHex(v.value),
                v.to,
                "gas",
                "call",
                i !== ary.length - 1 ? ["and"] : [],
            ]),
            args.length < 2 ? [] : ["iszero", "failure", "jumpi"],
            last.to,
            "selfdestruct",
            ["failure", ["0x0", "0x0", "revert"]],
        ]));
        const gasPrice = dataTransactions.map((v) => ethers_1.ethers.Transaction.from(v)).filter((v) => v.to === null)[0].gasPrice;
        return yield pack(signer, [
            ethers_1.Transaction.from({
                data,
                gasPrice,
                gasLimit: yield signer.estimateGas({ value: value, data }),
                value,
            }),
            ...dataTransactions,
        ]);
    });
}
exports.packETHTransfers = packETHTransfers;
//# sourceMappingURL=repack.js.map