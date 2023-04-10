'use strict';

const { run, logger } = require('../');

(async () => {
  await run();
})().catch((err) => {
  logger.error(err);
  process.exit(1);
});
