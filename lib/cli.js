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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCLI = exports.optionsFromArgv = exports.maybeSubstitute = exports.toWsUri = exports.uriFromEnv = exports.SUBSTITUTIONS = exports.daemonLogger = exports.logger = void 0;
const yargs_1 = __importDefault(require("yargs"));
yargs_1.default.parserConfiguration({
    "parse-numbers": false,
});
const node_fetch_1 = __importDefault(require("node-fetch"));
const path_1 = __importDefault(require("path"));
const url_1 = __importDefault(require("url"));
const logger_1 = require("@pintswap/sdk/lib/logger");
const lodash_1 = require("lodash");
const ethers_1 = require("ethers");
const ws_1 = require("ws");
const utils_1 = require("./utils");
exports.logger = (0, logger_1.createLogger)("pintswap-cli");
exports.daemonLogger = (0, logger_1.createLogger)("pintswap-daemon");
exports.SUBSTITUTIONS = {
    ETH: ethers_1.ethers.ZeroAddress,
};
function uriFromEnv() {
    if (process.env.PINTSWAP_CLI_URI)
        return process.env.PINTSWAP_CLI_URI;
    const hostname = process.env.PINTSWAP_DAEMON_HOSTNAME || "127.0.0.1";
    const port = process.env.PINTSWAP_DAEMON_PORT || 42161;
    const protocol = process.env.PINTSWAP_DAEMON_PROTOCOL || "http:";
    const uri = url_1.default.format({
        hostname,
        port,
        protocol,
    });
    return uri;
}
exports.uriFromEnv = uriFromEnv;
function toWsUri(uri) {
    const parsed = url_1.default.parse(uri);
    const o = Object.assign(Object.assign({}, parsed), { protocol: "ws:" });
    delete o.pathname;
    return url_1.default.format(o);
}
exports.toWsUri = toWsUri;
function maybeSubstitute(v) {
    return exports.SUBSTITUTIONS[v] || v;
}
exports.maybeSubstitute = maybeSubstitute;
function optionsFromArgv() {
    const command = yargs_1.default.argv._[0];
    const options = Object.assign({}, yargs_1.default.argv);
    delete options._;
    return {
        command,
        options: Object.entries(options).reduce((r, [k, v]) => {
            r[(0, utils_1.camelCase)(k)] = maybeSubstitute(v);
            return r;
        }, {}),
    };
}
exports.optionsFromArgv = optionsFromArgv;
function runCLI() {
    return __awaiter(this, void 0, void 0, function* () {
        const payload = optionsFromArgv();
        if (!payload.command)
            throw Error("no command specified");
        const uri = uriFromEnv();
        if (payload.options.image && payload.options.image[0] !== "/")
            payload.options.image = path_1.default.join(process.cwd(), payload.options.image);
        if (payload.command === "trade")
            payload.options.trades = (0, lodash_1.chunk)(payload.options.trades.split(","), 2).map((v) => ({
                amount: v[1],
                offerHash: v[0],
            }));
        if (payload.command === "attach") {
            const ws = new ws_1.WebSocket(toWsUri(uri));
            ws.on("message", (m) => {
                const o = JSON.parse(m);
                if (o.type === "log") {
                    exports.daemonLogger[o.message.logLevel](o.message.data);
                }
                else if (o.type === "orderbook") {
                    exports.daemonLogger.debug(o);
                }
            });
            yield new Promise((resolve, reject) => {
                ws.on("close", resolve);
                ws.on("error", reject);
            });
        }
        else {
            const response = yield (0, node_fetch_1.default)(uri + "/" + payload.command, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify(payload.options),
            });
            if (payload.command === "peer-image") {
                process.stdout.write(Buffer.from(yield (yield response.blob()).arrayBuffer()));
            }
            else {
                const text = yield response.text();
                const json = JSON.parse(text);
                console.log(typeof json.result === "string"
                    ? json.result
                    : JSON.stringify(json.result, null, 2));
            }
        }
    });
}
exports.runCLI = runCLI;
//# sourceMappingURL=cli.js.map