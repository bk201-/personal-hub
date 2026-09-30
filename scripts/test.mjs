import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scratch = fileURLToPath(new URL('../.local-validation/tests/', import.meta.url));
mkdirSync(scratch, { recursive: true });
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|CI|FORCE_COLOR|NO_COLOR)$/i.test(
      name,
    ),
  ),
);
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'test', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  env: {
    ...environment,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('../.local-validation/tests/unused-env', import.meta.url)),
    TMP: scratch,
    TEMP: scratch,
    TMPDIR: scratch,
  },
});
process.exitCode = result.status ?? 1;
