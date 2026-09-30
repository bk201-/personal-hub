import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock('../logger.js', () => ({ logger: { warn: vi.fn() } }));

import { existsSync, unlinkSync } from 'fs';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import { deleteAllMediaFiles } from './mediaFiles.js';

const mockExistsSync = vi.mocked(existsSync);
const mockUnlinkSync = vi.mocked(unlinkSync);

describe('deleteAllMediaFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnlinkSync.mockReset();
  });

  it('notifies the queue only after successfully freeing disk space', () => {
    const emit = vi.spyOn(downloadProgressEmitter, 'emit');
    mockExistsSync.mockReturnValue(true);
    deleteAllMediaFiles('channel/1.jpg', ['channel/1.jpg', 'channel/2.jpg']);
    expect(emit).toHaveBeenCalledExactlyOnceWith('storage_freed');

    emit.mockClear();
    mockUnlinkSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    deleteAllMediaFiles('channel/locked.jpg', null);
    expect(emit).not.toHaveBeenCalled();
    emit.mockRestore();
  });

  it('does nothing when both paths are null', () => {
    deleteAllMediaFiles(null, null);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('deletes single media path', () => {
    mockExistsSync.mockReturnValue(true);
    deleteAllMediaFiles('channel/photo.jpg', null);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('photo.jpg'));
  });

  it('deletes album paths when localMediaPaths is provided', () => {
    mockExistsSync.mockReturnValue(true);
    deleteAllMediaFiles('channel/1.jpg', ['channel/1.jpg', 'channel/2.jpg', 'channel/3.jpg']);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
  });

  it('skips files that do not exist on disk', () => {
    mockExistsSync.mockReturnValue(false);
    deleteAllMediaFiles('channel/gone.jpg', null);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('ignores unlink errors gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockUnlinkSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(() => deleteAllMediaFiles('channel/locked.jpg', null)).not.toThrow();
  });
});
