"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.createLogger = void 0;
const util_1 = __importDefault(require("util"));
require("setimmediate");
const lodash_1 = require("lodash");
const winston_1 = require("winston");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return winston_1.Logger; } });
const customLevels = {
    error: 0,
    warn: 1,
    data: 2,
    info: 3,
    debug: 4,
    verbose: 5,
    silly: 6,
    custom: 7,
};
const customColors = {
    error: "red",
    warn: "yellow",
    data: "grey",
    info: "green",
    debug: "red",
    verbose: "cyan",
    silly: "magenta",
    custom: "blue",
};
const customFormatter = ({ level, message, label, timestamp }) => {
    return `${label}|${timestamp}|${level}|${typeof message === "string"
        ? message
        : util_1.default.inspect(message, { colors: true, depth: 15 })}`;
};
function mapBigIntToHex(v) {
    if (Array.isArray(v))
        return v.map((v) => mapBigIntToHex(v));
    else if (typeof v === 'object') {
        return (0, lodash_1.mapValues)(v, (field) => mapBigIntToHex(field));
    }
    if (typeof v === 'bigint')
        return '0x' + v.toString(16);
    else
        return v;
}
const mapToBigIntSerializer = function (logger, method) {
    const _method = logger[method];
    logger[method] = function (...args) {
        return _method.apply(logger, args.map((v) => mapBigIntToHex(v)));
    };
    return logger;
};
const mapLogger = (logger) => {
    ['info', 'debug', 'error', 'warn'].forEach((v) => mapToBigIntSerializer(logger, v));
    return logger;
};
const createLogger = (proc) => {
    (0, winston_1.addColors)(customColors);
    const logger = (0, winston_1.createLogger)({
        defaultMeta: {
            service: proc || "pintswap",
        },
        levels: customLevels,
        format: winston_1.format.combine(winston_1.format.errors({ stack: true }), winston_1.format.json()),
        transports: [
            new winston_1.transports.Console({
                level: "verbose",
                format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.label({ label: proc }), winston_1.format.timestamp(), winston_1.format.printf(customFormatter)),
            }),
        ],
    });
    const error = logger.error;
    logger.error = function (err) {
        if (err instanceof Error) {
            error.call(logger, '');
            console.error(err);
        }
        else
            error.call(logger, err);
    };
    return mapLogger(logger);
};
exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map