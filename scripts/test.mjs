import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function testArguments(args = []) {
  const workspaces = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const workspace =
      argument === '--workspace'
        ? args[++index]
        : argument.startsWith('--workspace=')
          ? argument.slice('--workspace='.length)
          : undefined;
    if (!workspace || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(workspace)) {
      throw new Error('Expected --workspace <package-name>; other test-runner arguments are not supported.');
    }
    workspaces.push('--workspace', workspace);
  }
  return ['run', 'test', ...(workspaces.length ? workspaces : ['--workspaces']), '--if-present'];
}

export function testEnvironment(source, scratch) {
  const environment = Object.fromEntries(
    Object.entries(source).filter(([name]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|CI|FORCE_COLOR|NO_COLOR)$/i.test(
        name,
      ),
    ),
  );
  return {
    ...environment,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('../.local-validation/tests/unused-env', import.meta.url)),
    TMP: scratch,
    TEMP: scratch,
    TMPDIR: scratch,
  };
}

export function runTests({ args = [], environment = process.env, spawn = spawnSync } = {}) {
  const npmArguments = testArguments(args);
  if (!environment.npm_execpath) {
    throw new Error('Run through npm test (optionally: npm test -- --workspace <package-name>).');
  }
  const scratch = fileURLToPath(new URL('../.local-validation/tests/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const result = spawn(process.execPath, [environment.npm_execpath, ...npmArguments], {
    stdio: 'inherit',
    env: testEnvironment(environment, scratch),
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

if (import.meta.main) {
  process.exitCode = runTests({ args: process.argv.slice(2) });
}
