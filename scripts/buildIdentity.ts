import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function appBuildIdentity(appName: string, command: string): { buildId: string; plugin: Plugin } {
  const buildId = process.env.APP_BUILD_ID ?? `${appName}:${command === 'build' ? randomUUID() : 'development'}`;
  let root: string;
  return {
    buildId,
    plugin: {
      name: 'personal-hub-build-identity',
      configResolved(config) {
        root = config.root;
      },
      writeBundle() {
        const directory = path.join(root, 'dist');
        mkdirSync(directory, { recursive: true });
        writeFileSync(path.join(directory, 'build-id.json'), `${JSON.stringify({ buildId })}\n`);
      },
    },
  };
}
