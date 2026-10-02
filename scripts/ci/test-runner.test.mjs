import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runTests, testArguments, testEnvironment } from '../test.mjs';

test('root tests still run all workspaces with optional test scripts', () => {
  assert.deepEqual(testArguments(), ['run', 'test', '--workspaces', '--if-present']);
});

test('workspace filters support both npm argument forms without running other workspaces', () => {
  assert.deepEqual(testArguments(['--workspace', '@personal-hub/browser', '--workspace=tg-news-reader']), [
    'run',
    'test',
    '--workspace',
    '@personal-hub/browser',
    '--workspace',
    'tg-news-reader',
    '--if-present',
  ]);
});

test('missing workspace names and arbitrary npm flags fail closed', () => {
  for (const args of [
    ['--workspace'],
    ['--workspace='],
    ['--workspace', '--workspaces'],
    ['--workspace', '../elsewhere'],
    ['--workspace', 'tg-news-reader;echo unsafe'],
    ['--ignore-scripts'],
    ['tg-news-reader'],
  ]) {
    assert.throws(() => testArguments(args), /Expected --workspace/);
  }
});

test('sanitization strips tokens, application settings and Node/npm injection variables', () => {
  const clean = testEnvironment(
    {
      Path: 'safe-path',
      SYSTEMROOT: 'safe-system-root',
      CI: 'true',
      NO_COLOR: '1',
      NODE_ENV: 'production',
      NODE_OPTIONS: '--require=untrusted',
      npm_config_registry: 'untrusted-registry',
      npm_execpath: 'npm-cli',
      GH_TOKEN: 'disposable-test-value',
      PAT_TOKEN: 'disposable-test-value',
      DATABASE_URL: 'disposable-test-value',
      TELEGRAM_API_HASH: 'disposable-test-value',
      DOTENV_CONFIG_PATH: 'live-env',
      TEMP: 'live-data',
    },
    'test-scratch',
  );
  assert.deepEqual(Object.keys(clean).sort(), [
    'CI',
    'DOTENV_CONFIG_PATH',
    'NODE_ENV',
    'NO_COLOR',
    'Path',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
  ]);
  assert.equal(clean.Path, 'safe-path');
  assert.equal(clean.NODE_ENV, 'test');
  assert.match(clean.DOTENV_CONFIG_PATH, /\.local-validation[/\\]tests[/\\]unused-env$/);
  assert.equal(clean.TMP, 'test-scratch');
  assert.equal(clean.TEMP, clean.TMP);
  assert.equal(clean.TMPDIR, clean.TMP);
});

test('runner invokes npm without a shell and propagates failed tests and spawn failures', () => {
  for (const status of [0, 1, 27, null]) {
    let called = false;
    const exit = runTests({
      args: ['--workspace', 'czech-learning'],
      environment: { npm_execpath: 'npm-cli', GH_TOKEN: 'disposable-test-value', PATH: 'safe-path' },
      spawn: (command, args, options) => {
        called = true;
        assert.equal(command, process.execPath);
        assert.deepEqual(args, ['npm-cli', 'run', 'test', '--workspace', 'czech-learning', '--if-present']);
        assert.equal(options.stdio, 'inherit');
        assert.equal(options.shell, undefined);
        assert.equal(options.env.GH_TOKEN, undefined);
        assert.equal(options.env.PATH, 'safe-path');
        return { status };
      },
    });
    assert.equal(called, true);
    assert.equal(exit, status ?? 1);
  }
});

test('direct execution without npm reports the supported entry point', () => {
  assert.throws(() => runTests({ environment: {} }), /Run through npm test/);
});
