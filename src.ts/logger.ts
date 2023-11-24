import util from "util";
import "setimmediate";
import { ethers } from "ethers";
import { mapValues } from "lodash";
import {
  createLogger as createWinstonLogger,
  transports,
  Logger,
  format,
  addColors,
} from "winston";

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
  return `${label}|${timestamp}|${level}|${
    typeof message === "string"
      ? message
      : util.inspect(message, { colors: true, depth: 15 })
  }`;
};


function mapBigIntToHex(v) {
  if (Array.isArray(v)) return v.map((v) => mapBigIntToHex(v));
  else if (typeof v === 'object') {
    return mapValues(v, (field) => mapBigIntToHex(field));
  }
  if (typeof v === 'bigint') return '0x' + v.toString(16);
  else return v;
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

const createLogger = (proc?: string) => {
  addColors(customColors);
  const logger = createWinstonLogger({
    defaultMeta: {
      service: proc || "pintswap",
    },
    levels: customLevels,
    format: format.combine(format.errors({ stack: true }), format.json()),
    transports: [
      new transports.Console({
        level: "verbose",
        format: format.combine(
          format.colorize(),
          format.label({ label: proc }),
          format.timestamp(),
          format.printf(customFormatter),
        ),
      }),
    ],
  });
  const error = logger.error;
  (logger as any).error = function (err) {
    if (err instanceof Error) {
      error.call(logger, '');
      console.error(err);
    } else error.call(logger, err);
  };

  return mapLogger(logger);
};

export { createLogger, Logger };
