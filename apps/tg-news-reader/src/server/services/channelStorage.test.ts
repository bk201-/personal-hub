import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger.js';
import { createChannelStorageService } from './channelStorage.js';

vi.mock('../logger.js', () => ({ logger: { warn: vi.fn() } }));

const stats = { bytes: 42, fileCount: 2, checkedAt: 1_700_000_000 };

beforeEach(() => vi.clearAllMocks());

describe('channel storage cache and scheduler', () => {
  it('caches completed stats for 60 seconds, retaining the original checkedAt', async () => {
    let time = 0;
    const scan = vi.fn().mockResolvedValue(stats);
    const service = createChannelStorageService({ scan, now: () => time });
    expect(await service.getStats('channel')).toEqual(stats);
    time = 59_999;
    expect(await service.getStats('channel')).toEqual(stats);
    expect(scan).toHaveBeenCalledTimes(1);
    time = 60_000;
    const updated = { ...stats, checkedAt: stats.checkedAt + 60, bytes: 43 };
    scan.mockResolvedValueOnce(updated);
    expect(await service.getStats('channel')).toEqual(updated);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('bounds the default cache to 128 entries and evicts the least recently used', async () => {
    const scan = vi.fn().mockResolvedValue(stats);
    const service = createChannelStorageService({ scan });
    for (let i = 0; i < 128; i++) await service.getStats(`channel${i}`);
    await service.getStats('channel0');
    await service.getStats('channel128');
    await service.getStats('channel0');
    expect(scan).toHaveBeenCalledTimes(129);
    await service.getStats('channel1');
    expect(scan).toHaveBeenCalledTimes(130);
  });

  it('single-flights concurrent requests for the same channel', async () => {
    const gate = Promise.withResolvers<typeof stats>();
    const scan = vi.fn(() => gate.promise);
    const service = createChannelStorageService({ scan });
    const requests = Array.from({ length: 20 }, () => service.getStats('channel'));
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    gate.resolve(stats);
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 20 }, () => stats));
  });

  it('bounds concurrent scans and the pending queue, including queued single-flight requests', async () => {
    const gates = Array.from({ length: 4 }, () => Promise.withResolvers<typeof stats>());
    const scan = vi.fn((id: string) => gates[Number(id)].promise);
    const service = createChannelStorageService({ scan, concurrency: 2, maxQueued: 1 });
    const first = service.getStats('0');
    const second = service.getStats('1');
    const queued = service.getStats('2');
    const duplicate = service.getStats('2');
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    await expect(service.getStats('3')).rejects.toThrow('queue full');
    gates[0].resolve(stats);
    await first;
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(3));
    gates[1].resolve(stats);
    gates[2].resolve(stats);
    await Promise.all([second, queued, duplicate]);
    const recovered = service.getStats('3');
    gates[3].resolve(stats);
    expect(await recovered).toEqual(stats);
  });

  it('caches and logs scan failures once per cooldown, then permits recovery', async () => {
    let time = 0;
    const error = Object.assign(new Error('private filesystem path'), { code: 'EACCES' });
    const scan = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(stats);
    const service = createChannelStorageService({ scan, now: () => time });
    await expect(service.getStats('channel')).rejects.toThrow('Channel storage unavailable');
    time = 9_999;
    await expect(service.getStats('channel')).rejects.toThrow('Channel storage unavailable');
    expect(scan).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { module: 'channelStorage', err: error },
      'Channel storage scan failed',
    );
    time = 10_000;
    expect(await service.getStats('channel')).toEqual(stats);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('releases scan slots on failure and bounds failure cache entries too', async () => {
    const gate = Promise.withResolvers<typeof stats>();
    const scan = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(stats);
    const service = createChannelStorageService({ scan, concurrency: 1, maxCacheEntries: 1 });
    const failed = service.getStats('failed');
    const queued = service.getStats('queued');
    gate.reject(new Error('failure'));
    await expect(failed).rejects.toThrow('unavailable');
    expect(await queued).toEqual(stats);
    expect(await service.getStats('failed')).toEqual(stats);
    expect(scan).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid scheduler limits', () => {
    expect(() => createChannelStorageService({ maxCacheEntries: 0 })).toThrow('Invalid');
    expect(() => createChannelStorageService({ concurrency: 0 })).toThrow('Invalid');
    expect(() => createChannelStorageService({ maxQueued: -1 })).toThrow('Invalid');
  });

  it('cleans up single-flight state even if the scan implementation throws synchronously', async () => {
    let time = 0;
    const scan = vi.fn(() => {
      throw new Error('failure before returning a promise');
    });
    const service = createChannelStorageService({ scan, now: () => time });
    await expect(service.getStats('channel')).rejects.toThrow('unavailable');
    time = 10_000;
    await expect(service.getStats('channel')).rejects.toThrow('unavailable');
    expect(scan).toHaveBeenCalledTimes(2);
  });
});
