import { emasm } from "emasm";
import { ethers, Transaction } from "ethers";

export async function pack(signer, txs) {
  let nonce = Number(
    await signer.provider.getTransactionCount(await signer.getAddress()),
  );
  const { chainId } = await signer.provider.getNetwork();
  const address = await signer.getAddress();
  const packed = [];
  for (const v of txs) {
    const tx = ethers.Transaction.from(v);
    const o = ethers.Transaction.from(v).toJSON();
    const remap = Transaction.from(
      Object.assign(o, { signature: ethers.Signature.from(o.sig), nonce: (tx.from.toLowerCase() === address.toLowerCase() || (o.to === null && o.sig === null)) ? (nonce++) : o.nonce, chainId }),
    );
    if (!Number(remap.signature.r) || tx.from.toLowerCase() === address.toLowerCase()) {
      packed.push(await signer.signTransaction(remap.unsignedSerialized));
    }
    else packed.push(v);
  }
  packed.forEach((v) => {
    console.log(ethers.Transaction.from(v).toJSON());
  });
  return packed;
}

export function packPushZero(ary) {
  return _packPushZero(ary).ary;
}

function _packPushZero(
  ary,
  firstInstruction = true,
  noCalls = true,
  lastItemZero = false,
) {
  const result = ary.map((v) => {
    if (Array.isArray(v)) {
      const {
        ary: _ary,
        firstInstruction: _firstInstruction,
        noCalls: _noCalls,
        lastItemZero: _lastItemZero,
      } = _packPushZero(v, firstInstruction, noCalls, lastItemZero);
      firstInstruction = _firstInstruction;
      noCalls = _noCalls;
      lastItemZero = _lastItemZero;
      return _ary;
    } else if (!isNaN(v) && Number(v) === 0) {
      let op = firstInstruction ? 'pc' : noCalls ? 'returndatasize' : lastItemZero ? 'dup1' : '0x0';
      firstInstruction = false;
      lastItemZero = true;
      return op;
    } else {
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

export async function packETHTransfers(signer, args) {
  args = args.map((v) => Transaction.from(v));
  const valueTransfer = args.filter((v) => {
    if ([null, "0x"].includes(v.data)) return true;
    return false;
  });
  const last = valueTransfer[valueTransfer.length - 1];
  const dataTransactions = args.filter((v) => {
    if (![null, "0x"].includes(v.data)) return true;
    return false;
  });
  const value = ethers.toBeHex(
    valueTransfer.reduce((r, v) => ethers.getUint(v.value) + r, BigInt(0)),
  );
  const valueTransferExceptLast = valueTransfer.slice(0, -1);
  const data = emasm(
    packPushZero([
      valueTransferExceptLast.map((v, i, ary) => [
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        ethers.toBeHex(v.value),
        v.to,
        "gas",
        "call",
        i !== ary.length - 1 ? ["and"] : [],
      ]),
      args.length < 2 ? [] : ["iszero", "failure", "jumpi"],
      last.to,
      "selfdestruct",
      ["failure", ["0x0", "0x0", "revert"]],
    ]),
  );
  const gasPrice = dataTransactions.map((v) => ethers.Transaction.from(v)).filter((v) => v.to === null)[0].gasPrice;
  return await pack(signer, [
    Transaction.from({
      data,
      gasPrice,
      gasLimit: await signer.estimateGas({ value: value, data }),
      value,
    }),
    ...dataTransactions,
  ]);
}
