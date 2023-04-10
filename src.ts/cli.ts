import yargs from "yargs";
import fetch from "node-fetch";

import { camelCase } from "change-case";
import url from "url";
import util from "util";
import { createLogger } from "pintswap-sdk/lib/logger";

export const logger = createLogger('pintswap-cli');

export function uriFromEnv() {
  if (process.env.PINTSWAP_CLI_URI) return process.env.PINTSWAP_CLI_URI;
  const hostname = process.env.PINTSWAP_DAEMON_HOSTNAME || '127.0.0.1';
  const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
  const protocol = process.env.PINTSWAP_DAEMON_PROTOCOL || 'http:';

  const uri = url.format({
    hostname,
    port,
    protocol
  });
  return uri;
}

export function optionsFromArgv() {
  const command = yargs.argv._[0];
  const options = { ...yargs.argv };
  delete options._;
  return {
    command,
    options: Object.entries(options).reduce((r, [k, v]) => {
      r[camelCase(k)] = v;
      return r;
    }, {})
  };
}

export async function runCLI() {
  const payload = optionsFromArgv();
  if (!payload.command) throw Error('no command specified');
  const uri = uriFromEnv();
  const response = await fetch(uri + '/' + payload.command, {
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload.options)
  });
  const json = response.json();
  console.log(JSON.stringify(json.result, null, 2));
}
