import { describe, expect, it } from 'vitest';
import { getBufferSize, getLogEntries, logBufferStream } from './logBuffer.js';
import type { LogEntry } from './logBuffer.js';

// Helper to push a JSON log line through the writable stream
function pushEntry(entry: LogEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    logBufferStream.write(JSON.stringify(entry) + '\n', (err: Error | null | undefined) =>
      err ? reject(err) : resolve(),
    );
  });
}

// Note: buffer state persists across tests within the same module.
// Tests use unique timestamps to isolate data and rely on getLogEntries filtering.

describe('logBuffer', () => {
  const BASE_TIME = 1_000_000_000;

  it('stores entries and returns them via getLogEntries', async () => {
    const entry: LogEntry = { time: BASE_TIME, level: 30, module: 'test', msg: 'hello' };
    await pushEntry(entry);

    const result = getLogEntries(BASE_TIME, 30);
    expect(result.some((e: LogEntry) => e.msg === 'hello')).toBe(true);
  });

  it('getBufferSize increments as entries are added', async () => {
    const before = getBufferSize();
    await pushEntry({ time: BASE_TIME + 100, level: 30, msg: 'a' });
    await pushEntry({ time: BASE_TIME + 101, level: 30, msg: 'b' });
    expect(getBufferSize()).toBe(before + 2);
  });

  it('filters by sinceMs', async () => {
    const t = BASE_TIME + 200;
    await pushEntry({ time: t - 10, level: 30, msg: 'old' });
    await pushEntry({ time: t + 10, level: 30, msg: 'new' });

    const result = getLogEntries(t, 10);
    expect(result.some((e: LogEntry) => e.msg === 'new')).toBe(true);
    expect(result.some((e: LogEntry) => e.msg === 'old')).toBe(false);
  });

  it('filters by minLevel', async () => {
    const t = BASE_TIME + 300;
    await pushEntry({ time: t, level: 20, msg: 'debug-msg' });
    await pushEntry({ time: t, level: 50, msg: 'error-msg' });

    const result = getLogEntries(t, 40);
    expect(result.some((e: LogEntry) => e.msg === 'error-msg')).toBe(true);
    expect(result.some((e: LogEntry) => e.msg === 'debug-msg')).toBe(false);
  });

  it('ignores malformed JSON lines', async () => {
    const before = getBufferSize();
    await new Promise<void>((resolve, reject) => {
      logBufferStream.write('not valid json\n', (err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
    expect(getBufferSize()).toBe(before); // size unchanged
  });
});
