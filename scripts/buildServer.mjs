import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const directory of ['dist/server', 'dist/shared']) {
  rmSync(directory, { recursive: true, force: true });
}
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.server.build.json'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
