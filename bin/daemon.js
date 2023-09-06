#!/usr/bin/env node
'use strict';

const yargs = require('yargs');
const { ethers } = require('ethers');
yargs.parserConfiguration({ 'parse-numbers': false });
const options = { ...yargs.argv };
const subcommand = options._;
delete options._;
const rpcHost = options['rpc-host'];
const rpcPort = options['rpc-port'];
const wallet = options.wallet;
if (wallet) {
  if (ethers.Mnemonic.isValidMnemonic(wallet)) process.env.PINTSWAP_DAEMON_WALLET = ethers.Wallet.fromPhrase(wallet).privateKey;
  else process.env.PINTSWAP_DAEMON_WALLET = wallet;
}
if (rpcHost) process.env.PINTSWAP_DAEMON_HOST = rpcHost;
if (rpcPort) process.env.PINTSWAP_DAEMON_PORT = rpcPort;
const { PintswapDaemon, logger } = require('../');

(async () => {
  const daemon = await PintswapDaemon.create();
  await daemon.start();
})().catch((err) => {
  logger.error(err);
  process.exit(1);
});
