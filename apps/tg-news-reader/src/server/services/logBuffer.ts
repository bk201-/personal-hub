import { Writable } from 'node:stream';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  time: number;
  level: number;
  module?: string;
  msg: string;
  [key: string]: unknown;
}

export const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// ─── Circular buffer (O(1) push, no Array.shift) ─────────────────────────────

const MAX_ENTRIES = 2000;
const _buf: (LogEntry | undefined)[] = Array.from<LogEntry | undefined>({ length: MAX_ENTRIES });
let _head = 0; // next write position
let _size = 0; // current number of entries

export function getLogEntries(sinceMs: number, minLevel: number): LogEntry[] {
  const result: LogEntry[] = [];
  // Read oldest → newest
  const start = _size < MAX_ENTRIES ? 0 : _head;
  for (let i = 0; i < _size; i++) {
    const e = _buf[(start + i) % MAX_ENTRIES]!;
    if (e.time >= sinceMs && e.level >= minLevel) result.push(e);
  }
  return result;
}

export function getBufferSize(): number {
  return _size;
}

// ─── Writable stream consumed by pino multistream ────────────────────────────

export const logBufferStream = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    try {
      const line = chunk.toString().trim();
      if (line) {
        const entry = JSON.parse(line) as LogEntry;
        _buf[_head] = entry;
        _head = (_head + 1) % MAX_ENTRIES;
        if (_size < MAX_ENTRIES) _size++;
      }
    } catch {
      // ignore JSON parse errors (e.g. partial writes)
    }
    callback();
  },
});
