import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { parseCleanupArgs, reserveMaintenancePort } from './mediaCleanupCommand.js';

describe('media cleanup command safety', () => {
  it('defaults to dry run and requires explicit offline confirmation to apply', () => {
    expect(parseCleanupArgs([])).toEqual({ apply: false, help: false });
    expect(parseCleanupArgs(['--help'])).toEqual({ apply: false, help: true });
    expect(parseCleanupArgs(['--apply', '--offline'])).toEqual({ apply: true, help: false });
    expect(() => parseCleanupArgs(['--apply'])).toThrow('Stop every app replica');
    expect(() => parseCleanupArgs(['--force'])).toThrow('Unknown argument');
  });

  it.each([0, -1, 65536, NaN, 1.5])('refuses invalid server port %s', async (port) => {
    await expect(reserveMaintenancePort(port)).rejects.toThrow('Invalid SERVER_PORT');
  });

  it('refuses cleanup when the server port is occupied and holds it until maintenance ends', async () => {
    const app = createServer();
    await new Promise<void>((resolve) => app.listen(0, '0.0.0.0', resolve));
    const address = app.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    try {
      await expect(reserveMaintenancePort(address.port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await new Promise<void>((resolve, reject) => app.close((err) => (err ? reject(err) : resolve())));
    }
    const release = await reserveMaintenancePort(address.port);
    try {
      await expect(reserveMaintenancePort(address.port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await release();
    }
    const releaseAgain = await reserveMaintenancePort(address.port);
    await releaseAgain();
  });
});
