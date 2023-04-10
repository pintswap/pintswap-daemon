#!/usr/bin/env node
'use strict';

const { runCLI, logger } = require('../lib/cli');

(async () => {
  await runCLI();
  process.exit(0);
})().catch((err) => {
  logger.error(err);
  process.exit(1);
});
