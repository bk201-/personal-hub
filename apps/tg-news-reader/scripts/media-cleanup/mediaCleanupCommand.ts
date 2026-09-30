import { createServer } from 'node:net';

export function parseCleanupArgs(args: string[]): { apply: boolean; help: boolean } {
  const known = new Set(['--apply', '--offline', '--help']);
  const unknown = args.find((arg) => !known.has(arg));
  if (unknown) throw new Error(`Unknown argument: ${unknown}`);
  if (args.includes('--apply') && !args.includes('--offline')) {
    throw new Error('Stop every app replica/writer, then confirm with --apply --offline');
  }
  return { apply: args.includes('--apply'), help: args.includes('--help') };
}

/** Hold the app's port so the local server cannot run/start while files are deleted. */
export async function reserveMaintenancePort(port: number): Promise<() => Promise<void>> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SERVER_PORT');
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
}
