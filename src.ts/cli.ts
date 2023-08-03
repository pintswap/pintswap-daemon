import yargs from "yargs";
yargs.parserConfiguration({
  "parse-numbers": false,
});
import fetch from "node-fetch";
import path from "path";

import { camelCase } from "change-case";
import url from "url";
import util from "util";
import { createLogger } from "@pintswap/sdk/lib/logger";
import { chunk } from "lodash";
import { ethers } from "ethers";
import { WebSocket } from "ws";

export const logger: any = createLogger("pintswap-cli");
export const daemonLogger: any = createLogger("pintswap-daemon");

export const SUBSTITUTIONS = {
  ETH: ethers.ZeroAddress,
};

export function uriFromEnv() {
  if (process.env.PINTSWAP_CLI_URI) return process.env.PINTSWAP_CLI_URI;
  const hostname = process.env.PINTSWAP_DAEMON_HOSTNAME || "127.0.0.1";
  const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
  const protocol = process.env.PINTSWAP_DAEMON_PROTOCOL || "http:";

  const uri = url.format({
    hostname,
    port,
    protocol,
  });
  return uri;
}

export function maybeSubstitute(v) {
  return SUBSTITUTIONS[v] || v;
}

export function optionsFromArgv() {
  const command = yargs.argv._[0];
  const options = { ...yargs.argv };
  delete options._;
  return {
    command,
    options: Object.entries(options).reduce((r, [k, v]) => {
      r[camelCase(k)] = maybeSubstitute(v);
      return r;
    }, {}),
  };
}

export async function runCLI() {
  const payload: any = optionsFromArgv();
  if (!payload.command) throw Error("no command specified");
  const uri = uriFromEnv();
  if (payload.options.image && payload.options.image[0] !== "/")
    payload.options.image = path.join(process.cwd(), payload.options.image);
  if (payload.command === "trade")
    chunk(payload.options.trades.split(","), 2).map((v) => ({
      amount: v[1],
      offerHash: v[0],
    }));
  if (payload.command === "attach") {
    const ws = new WebSocket(uri);
    ws.on("message", (m) => {
      const o = JSON.parse(m);
      if (o.type === "log") {
        daemonLogger[o.message.logLevel](o.message.data);
      }
    });
  } else {
    const response = await fetch(uri + "/" + payload.command, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload.options),
    });
    const json = await response.json();
    console.log(
      typeof json.result === "string"
        ? json.result
        : JSON.stringify(json.result, null, 2),
    );
  }
}
