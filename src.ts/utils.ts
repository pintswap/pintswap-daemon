import { FlashbotsBundleProvider } from "./flashbots";

export async function waitForBlock(provider, number) {
  while (true) {
    const block = await provider.getBlock(Number(number));
    if (block) return block;
    await timeout(3000);
  }
}

const BUILDER_RPCS = [
  "https://relay.flashbots.net",
  "https://builder0x69.io",
  "https://rpc.beaverbuild.org",
  "https://rsync-builder.xyz",
  "https://rpc.titanbuilder.xyz",
  "https://api.edennetwork.io/v1/bundle",
];

export const timeout = async (n) =>
  await new Promise((resolve) => setTimeout(resolve, n));

export async function sendBundle(
  logger: any,
  flashbots: any,
  txs,
  blockNumber,
) {
  const provider = flashbots.provider;
  const list = await Promise.all(
    BUILDER_RPCS.map(async (rpc) =>
      (
        await FlashbotsBundleProvider.create(
          flashbots.provider,
          flashbots.authSigner,
          rpc,
        )
      )
        .sendBundle(txs, blockNumber)
        .catch((err) => {
          /* logger.error(err) */
        }),
    ),
  );
  const { bundleTransactions } = (list as any).find(Boolean);
  console.log(bundleTransactions)
  const { hash: txHash } = bundleTransactions[bundleTransactions.length - 1];

  logger.info("waiting for block " + Number(blockNumber));
  await waitForBlock(provider, blockNumber);
  const receipt = await provider.getTransactionReceipt(txHash);
  logger.info("receipt:");
  logger.info(receipt);
  if (!receipt)
    return await sendBundle(logger, flashbots, txs, blockNumber + 5);
  return receipt;
}
