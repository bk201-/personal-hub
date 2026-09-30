import pino from 'pino';
import { logBufferStream } from './services/logBuffer.js';

const isDev = process.env.NODE_ENV !== 'production';
const level = (process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info')) as pino.Level;

/**
 * Centralised pino logger instance.
 *
 * Dev:  pino-pretty (colourised) + in-memory log buffer
 * Prod: JSON stdout + in-memory log buffer
 *
 * Buffer holds last 2000 entries; served via GET /api/logs for in-app log viewer.
 * Level override: LOG_LEVEL env variable (debug | info | warn | error)
 */
const prettyTransport = isDev
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '[{module}] {msg}',
      },
    })
  : null;

export const logger = pino(
  { level },
  pino.multistream([
    prettyTransport ? { stream: prettyTransport, level } : { stream: process.stdout, level },
    { stream: logBufferStream, level },
  ]),
);
