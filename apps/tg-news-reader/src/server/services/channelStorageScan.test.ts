import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanChannelStorage } from './channelStorageScan.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
}));

let fixture: string;
let dataRoot: string;

beforeEach(async () => {
  fixture = resolve('src', 'server', 'services', `.channel-storage-fixture-${randomUUID()}`);
  dataRoot = join(fixture, 'data');
  await fs.mkdir(join(dataRoot, 'channel'), { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(fixture, { recursive: true, force: true });
});

describe('channel storage filesystem scan', () => {
  it('sums regular logical bytes, including orphan, empty, partial and nested Instant View files', async () => {
    await fs.mkdir(join(dataRoot, 'channel', 'nested'));
    await fs.mkdir(join(dataRoot, 'tts', 'hash'), { recursive: true });
    await fs.mkdir(join(dataRoot, 'other'));
    await Promise.all([
      fs.writeFile(join(dataRoot, 'channel', 'video.mp4'), Buffer.alloc(11)),
      fs.writeFile(join(dataRoot, 'channel', 'photo.jpg'), Buffer.alloc(7)),
      fs.writeFile(join(dataRoot, 'channel', 'empty'), ''),
      fs.writeFile(join(dataRoot, 'channel', 'orphan'), Buffer.alloc(3)),
      fs.writeFile(join(dataRoot, 'channel', 'in-progress.part'), Buffer.alloc(13)),
      fs.writeFile(join(dataRoot, 'channel', 'nested', 'iv_1_0.jpg'), Buffer.alloc(5)),
      fs.writeFile(join(dataRoot, 'db.sqlite'), Buffer.alloc(100)),
      fs.writeFile(join(dataRoot, 'tts', 'hash', '0.mp3'), Buffer.alloc(100)),
      fs.writeFile(join(dataRoot, 'other', 'photo.jpg'), Buffer.alloc(100)),
    ]);
    const open = vi.spyOn(fs, 'opendir');
    expect(await scanChannelStorage('channel', { dataRoot, now: () => 1_700_000_000_999 })).toEqual({
      bytes: 39,
      fileCount: 6,
      checkedAt: 1_700_000_000,
    });
    expect(open.mock.calls.map(([path]) => path)).toEqual([
      join(dataRoot, 'channel'),
      join(dataRoot, 'channel', 'nested'),
    ]);
  });

  it('returns zero for absent channels and absent data roots', async () => {
    for (const root of [dataRoot, join(fixture, 'missing')]) {
      expect(await scanChannelStorage('-1001234', { dataRoot: root })).toMatchObject({
        bytes: 0,
        fileCount: 0,
      });
    }
  });

  it.each([
    '',
    '.',
    '..',
    '../channel',
    '..\\channel',
    '/channel',
    'C:\\channel',
    'channel/subdir',
    'channel\\subdir',
    'channel:stream',
    'channel.',
    'channel ',
    'channel\0',
    'tts',
    'TTS',
    'db',
    'db.sqlite',
    'db.sqlite-wal',
    'CON',
    'aux',
    'NUL',
    'COM1',
    'lpt9',
    'a'.repeat(65),
  ])('rejects unsafe or reserved channel ID %j before filesystem access', async (id) => {
    const stat = vi.spyOn(fs, 'lstat');
    const open = vi.spyOn(fs, 'opendir');
    await expect(scanChannelStorage(id, { dataRoot })).rejects.toThrow('Unsafe');
    expect(stat).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects a non-directory channel path and non-directory ancestor', async () => {
    await fs.writeFile(join(dataRoot, 'file'), 'not a directory');
    await expect(scanChannelStorage('file', { dataRoot })).rejects.toThrow('Invalid channel storage directory');
    await expect(scanChannelStorage('child', { dataRoot: join(dataRoot, 'file') })).rejects.toThrow(
      'Invalid channel storage ancestor',
    );
  });

  it.each(['channel', 'descendant', 'dataRoot', 'ancestor'])(
    'rejects %s junctions without traversing them',
    async (location) => {
      const target = join(fixture, 'outside');
      await fs.mkdir(join(target, 'data', 'channel'), { recursive: true });
      await fs.writeFile(join(target, 'secret'), 'must not count');
      let root = dataRoot;
      let link: string;
      if (location === 'channel') {
        link = join(dataRoot, 'channel');
        await fs.rm(link, { recursive: true });
      } else if (location === 'descendant') {
        link = join(dataRoot, 'channel', 'linked');
      } else if (location === 'dataRoot') {
        link = join(fixture, 'linked-data');
        root = link;
      } else {
        link = join(fixture, 'linked-parent');
        root = join(link, 'data');
      }
      await fs.symlink(target, link, 'junction');
      const open = vi.spyOn(fs, 'opendir');
      await expect(scanChannelStorage('channel', { dataRoot: root })).rejects.toThrow('Linked');
      expect(open.mock.calls.every(([path]) => path === join(dataRoot, 'channel'))).toBe(true);
    },
  );

  it('rejects file symlinks without counting their targets', async () => {
    await fs.writeFile(join(dataRoot, 'channel', 'link'), '');
    const original = fs.lstat;
    const stat = await original(join(dataRoot, 'channel', 'link'));
    vi.spyOn(fs, 'lstat').mockImplementation(async (...args) =>
      String(args[0]) === join(dataRoot, 'channel', 'link')
        ? Object.assign(stat, { isSymbolicLink: () => true })
        : original(...args),
    );
    await expect(scanChannelStorage('channel', { dataRoot })).rejects.toThrow('Linked');
  });

  it('treats a file disappearing between enumeration and lstat as a benign race', async () => {
    const gone = join(dataRoot, 'channel', 'gone');
    await fs.writeFile(gone, 'gone');
    await fs.writeFile(join(dataRoot, 'channel', 'kept'), 'keep');
    const original = fs.lstat;
    vi.spyOn(fs, 'lstat').mockImplementation(async (...args) => {
      if (String(args[0]) === gone) {
        await fs.unlink(gone);
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      }
      return original(...args);
    });
    expect(await scanChannelStorage('channel', { dataRoot })).toMatchObject({ bytes: 4, fileCount: 1 });
  });

  it('treats a directory disappearing before opendir as a benign race', async () => {
    vi.spyOn(fs, 'opendir').mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    expect(await scanChannelStorage('channel', { dataRoot })).toMatchObject({ bytes: 0, fileCount: 0 });
  });

  it.each(['EACCES', 'EPERM', 'EIO', 'ENOTDIR'])('propagates %s rather than returning zero', async (code) => {
    const error = Object.assign(new Error('unavailable'), { code });
    const stat = vi.spyOn(fs, 'lstat').mockRejectedValueOnce(error);
    await expect(scanChannelStorage('channel', { dataRoot })).rejects.toBe(error);
    stat.mockRestore();
    vi.spyOn(fs, 'opendir').mockRejectedValueOnce(error);
    await expect(scanChannelStorage('channel', { dataRoot })).rejects.toBe(error);
  });

  it('fails explicitly instead of returning partial results at the entry limit', async () => {
    await fs.writeFile(join(dataRoot, 'channel', 'one'), 'one');
    await fs.writeFile(join(dataRoot, 'channel', 'two'), 'two');
    await expect(scanChannelStorage('channel', { dataRoot, maxEntries: 1 })).rejects.toThrow('entry limit');
  });

  it('fails explicitly at the depth and time limits', async () => {
    await fs.mkdir(join(dataRoot, 'channel', 'nested'));
    await expect(scanChannelStorage('channel', { dataRoot, maxDepth: 0 })).rejects.toThrow('depth limit');
    let time = 0;
    await expect(scanChannelStorage('channel', { dataRoot, maxDurationMs: 2, now: () => time++ })).rejects.toThrow(
      'time limit',
    );
  });

  it('fails explicitly when byte totals cannot be represented safely', async () => {
    await fs.writeFile(join(dataRoot, 'channel', 'huge'), '');
    const original = fs.lstat;
    vi.spyOn(fs, 'lstat').mockImplementation(async (...args) => {
      const stat = await original(...args);
      if (String(args[0]) === join(dataRoot, 'channel', 'huge')) stat.size = Number.MAX_SAFE_INTEGER + 1;
      return stat;
    });
    await expect(scanChannelStorage('channel', { dataRoot })).rejects.toThrow('size limit');
  });

  it('does not count special files such as sockets or FIFOs', async () => {
    const path = join(dataRoot, 'channel', 'special');
    await fs.writeFile(path, 'not a regular file');
    const original = fs.lstat;
    vi.spyOn(fs, 'lstat').mockImplementation(async (...args) => {
      const stat = await original(...args);
      if (String(args[0]) === path) stat.isFile = () => false;
      return stat;
    });
    expect(await scanChannelStorage('channel', { dataRoot })).toMatchObject({ bytes: 0, fileCount: 0 });
  });
});
