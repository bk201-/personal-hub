import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { retainBackups } from './artifacts.mjs';
import { createDeployment, imageDeletionCandidates, settings, validateApp } from './azure.mjs';
import { githubApi, SOURCE, SOURCE_WORKFLOW, TARGET, verifyHandoff } from './guard.mjs';
import { affectsNews, lastSuccessfulDeployment, pathsSinceDeployment, PRODUCTION_ENVIRONMENT } from './paths.mjs';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const digest = `sha256:${'c'.repeat(64)}`;
const workflow = readFileSync(
  resolve(import.meta.dirname, '..', '..', '..', '..', '.github', 'workflows', 'deploy-tg-news-reader.yml'),
  'utf8',
).replaceAll('\r\n', '\n');
const jobs = Object.fromEntries(
  [...workflow.split('\njobs:\n')[1].matchAll(/^ {2}([\w-]+):\n([\s\S]*?)(?=^ {2}[\w-]+:\n|(?![\s\S]))/gm)].map(
    (match) => match.slice(1),
  ),
);
const steps = (job) => job.split(/(?=^ {6}- )/m).slice(1);
test('news runtime preserves the standalone working directory, volume, port and entry point', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
  const runtime = dockerfile.split(/^FROM .+ AS runner\s*$/m)[1];
  assert.ok(runtime);
  assert.equal([...runtime.matchAll(/^WORKDIR (.+)$/gm)].at(-1)[1].trim(), '/app');
  assert.match(runtime, /^VOLUME \/app\/data\s*$/m);
  assert.match(runtime, /^EXPOSE 3173\s*$/m);
  assert.deepEqual(JSON.parse(runtime.match(/^CMD (\[.+\])\s*$/m)[1]), [
    'node',
    '--disable-warning=DEP0040',
    'dist/server/index.js',
  ]);
});
function patch(object, path, changes) {
  const keys = path.split('.').filter(Boolean);
  Object.assign(
    keys.reduce((part, key) => part[key], object),
    changes,
  );
}
const ciWorkflow = { id: 41, name: 'CI', state: 'active', path: '.github/workflows/ci.yml' };
const ciRun = (overrides = {}) => ({
  id: 101,
  workflow_id: 41,
  name: 'CI',
  run_attempt: 2,
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  repository: { full_name: TARGET },
  head_repository: { full_name: TARGET },
  ...overrides,
});

function bootstrapFixture() {
  const fixture = {
    main: sha,
    workflows: [ciWorkflow],
    runs: [ciRun()],
    run: ciRun(),
    outputs: {},
    context: {
      repo: { owner: 'bk201-', repo: 'personal-hub' },
      eventName: 'workflow_run',
      ref: 'refs/heads/main',
      sha,
      payload: { workflow_run: ciRun() },
    },
  };
  fixture.execute = async () => {
    const script = jobs.qualify.match(/^ {10}script: \|\n((?: {12}.*\n|\n)+)/m)?.[1];
    assert.ok(script, 'The pre-checkout bootstrap must remain an inspectable inline script');
    const listRepoWorkflows = () => assert.fail('Use pagination for workflow discovery');
    const respond = (expected, data) => async (args) => {
      assert.partialDeepStrictEqual(args, expected);
      return { data };
    };
    const github = {
      rest: {
        repos: { getBranch: respond({ branch: 'main' }, { commit: { sha: fixture.main } }) },
        actions: {
          listRepoWorkflows,
          listWorkflowRuns: respond(
            { workflow_id: 41, branch: 'main', head_sha: fixture.main },
            { workflow_runs: fixture.runs },
          ),
          getWorkflowRun: respond({ run_id: fixture.run.id }, fixture.run),
        },
      },
      paginate: async (method) => {
        assert.equal(method, listRepoWorkflows);
        return fixture.workflows;
      },
    };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('github', 'context', 'core', script.replace(/^ {12}/gm, ''))(github, fixture.context, {
      setOutput: (key, value) => Object.assign(fixture.outputs, { [key]: value }),
    });
  };
  return fixture;
}

test('bootstrap accepts latest successful push and manual main CI, emitting immutable identity', async (t) => {
  for (const event of ['push', 'workflow_dispatch']) {
    await t.test(event, async () => {
      const f = bootstrapFixture();
      f.run.event = event;
      f.runs = [ciRun({ id: 99 }), f.run];
      f.context.payload.workflow_run = f.run;
      if (event === 'workflow_dispatch') f.context.eventName = event;
      await f.execute();
      assert.deepEqual(f.outputs, { sha, 'run-id': '101', 'run-attempt': '2' });
    });
  }
});

test('bootstrap rejects untrusted, stale, non-successful and rerun CI before emitting outputs', async (t) => {
  const trigger = 'context.payload.workflow_run';
  const cases = [
    ['manual nonmain', 'context', { eventName: 'workflow_dispatch', ref: 'refs/heads/topic' }],
    ['manual stale SHA', 'context', { eventName: 'workflow_dispatch', sha: otherSha }],
    ['failed CI', 'run', { conclusion: 'failure' }],
    ['running CI', 'run', { status: 'in_progress', conclusion: null }],
    ['cancelled CI', 'run', { conclusion: 'cancelled' }],
    ['PR CI', 'run', { event: 'pull_request' }],
    ['fork CI', 'run.head_repository', { full_name: 'outsider/fork' }],
    ['wrong workflow id', 'run', { workflow_id: 42 }],
    ['wrong workflow name', 'run', { name: 'Other' }],
    ['no CI workflow', '', { workflows: [] }],
    ['ambiguous CI workflow', '', { workflows: [ciWorkflow, { ...ciWorkflow, id: 42 }] }],
    ['stale event', trigger, { id: 100 }],
    ['stale rerun event', trigger, { run_attempt: 1 }],
    ['rerun after listing', 'run', { run_attempt: 3 }],
    ['stale main', 'run', { head_sha: otherSha }],
    ['PR trigger', 'context', { eventName: 'pull_request' }],
    ['fork trigger', `${trigger}.head_repository`, { full_name: 'outsider/fork' }],
    ['superseded success', '', { runs: [ciRun(), ciRun({ id: 102, status: 'queued', conclusion: null })] }],
  ];
  for (const [name, path, changes] of cases) {
    await t.test(name, async () => {
      const f = bootstrapFixture();
      patch(f, path, changes);
      await assert.rejects(f.execute(), /CI|dispatch|trigger|workflow/);
      assert.deepEqual(f.outputs, {});
    });
  }
});

test('paths skip only unrelated apps; shared, news, lockfile, workflow and root tooling trigger', () => {
  assert.equal(affectsNews(['apps/czech-learning/a.ts', 'apps/dmitriishilov.com/a.astro']), false);
  assert.equal(affectsNews([]), false);
  for (const path of [
    'apps/tg-news-reader/src/server/index.ts',
    'packages/browser/src/index.ts',
    'packages/auth-server/a.ts',
    'package-lock.json',
    '.github/workflows/deploy-tg-news-reader.yml',
    'package.json',
    '.oxlintrc.json',
    'scripts/test.mjs',
    'tsconfig.json',
  ])
    assert.equal(affectsNews(['apps/czech-learning/a.ts', path]), true, path);
});

test('cumulative deployment diff disables rename detection so news removals count', () => {
  const calls = [];
  const paths = pathsSinceDeployment(otherSha, (args) => {
    calls.push(args);
    return calls.length === 1 ? `${sha}\n` : 'apps/tg-news-reader/removed.ts\0apps/czech-learning/renamed.ts\0';
  });
  assert.deepEqual(calls, [
    ['rev-parse', 'HEAD'],
    ['diff', '--no-renames', '--name-only', '-z', otherSha, sha],
  ]);
  assert.equal(affectsNews(paths), true);
  assert.equal(paths.length, 2);
});

test('first deployment inventories the complete tree without guessing a deployed baseline', () => {
  const calls = [];
  const paths = pathsSinceDeployment(null, (args) => {
    calls.push(args);
    return calls.length === 1 ? `${sha}\n` : 'package-lock.json\0';
  });
  assert.deepEqual(paths, ['package-lock.json']);
  assert.deepEqual(calls[1], ['ls-tree', '-r', '--name-only', '-z', sha]);
});

test('news A overtaken by unrelated B remains relevant since the last successful deployment', async () => {
  const deployed = 'c'.repeat(40);
  const calls = [];
  const baseline = await lastSuccessfulDeployment(async (path) => {
    calls.push(path);
    if (path.includes('/statuses')) {
      return path.includes('/deployments/3/') ? [{ state: 'failure' }] : [{ state: 'inactive' }, { state: 'success' }];
    }
    return [
      { id: 3, environment: PRODUCTION_ENVIRONMENT, sha },
      { id: 2, environment: PRODUCTION_ENVIRONMENT, sha: deployed },
    ];
  });
  assert.equal(baseline, deployed);
  const gitCalls = [];
  const paths = pathsSinceDeployment(baseline, (args) => {
    gitCalls.push(args);
    return args[0] === 'rev-parse'
      ? otherSha
      : 'apps/tg-news-reader/pending-news.ts\0apps/czech-learning/later-change.ts\0';
  });
  assert.deepEqual(gitCalls[1], ['diff', '--no-renames', '--name-only', '-z', deployed, otherSha]);
  assert.equal(affectsNews(paths), true);
  assert.match(calls[0], /environment=tg-news-reader-production/);
});

test('successful deployment baseline survives skips and only unrelated later changes can skip news', async () => {
  const baseline = await lastSuccessfulDeployment(async (path) =>
    path.includes('/statuses')
      ? [{ state: 'success' }]
      : [{ id: 1, environment: PRODUCTION_ENVIRONMENT, sha: otherSha }],
  );
  assert.equal(baseline, otherSha);
  assert.equal(
    affectsNews(
      pathsSinceDeployment(baseline, (args) => (args[0] === 'rev-parse' ? sha : 'apps/czech-learning/a.ts\0')),
    ),
    false,
  );
  assert.equal(await lastSuccessfulDeployment(async () => []), null);
});

test('deployment baseline lookup paginates and fails closed on invalid metadata or access', async () => {
  const batch = Array.from({ length: 100 }, (_, index) => ({
    id: index + 2,
    environment: PRODUCTION_ENVIRONMENT,
    sha,
  }));
  const seen = [];
  const baseline = await lastSuccessfulDeployment(async (path) => {
    seen.push(path);
    if (path.includes('/statuses')) return [{ state: path.includes('/deployments/1/') ? 'success' : 'failure' }];
    return path.endsWith('page=1') ? batch : [{ id: 1, environment: PRODUCTION_ENVIRONMENT, sha: otherSha }];
  });
  assert.equal(baseline, otherSha);
  assert.ok(seen.some((path) => path.endsWith('page=2')));
  await assert.rejects(
    lastSuccessfulDeployment(async () => ({ invalid: true })),
    /history/,
  );
  await assert.rejects(
    lastSuccessfulDeployment(async () => [{ id: 1, environment: 'other-app', sha }]),
    /history/,
  );
  await assert.rejects(
    lastSuccessfulDeployment(async () => {
      throw new Error('denied');
    }),
    /denied/,
  );
  await assert.rejects(
    lastSuccessfulDeployment(async (path) => (path.includes('/statuses') ? [{ state: 'failure' }] : batch)),
    /bounded/,
  );
  assert.throws(() => pathsSinceDeployment('main', () => sha), /comparison SHA/);
});
const activeStatuses = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
function guardFixture() {
  const sourcePath = `/repos/${SOURCE}/actions/workflows/${SOURCE_WORKFLOW}`;
  const f = { main: sha, run: ciRun(), latest: [ciRun()], state: 'disabled_manually', active: '', sourceCalls: [] };
  f.options = {
    sha,
    runId: '101',
    attempt: '2',
    mode: 'stop-before-start',
    target: async (path) => {
      if (path === `/repos/${TARGET}/branches/main`) return { commit: { sha: f.main } };
      if (path === `/repos/${TARGET}/actions/runs/101`) return f.run;
      if (path === `/repos/${TARGET}/actions/workflows/41`) return ciWorkflow;
      assert.equal(path, `/repos/${TARGET}/actions/workflows/41/runs?branch=main&head_sha=${sha}&per_page=100`);
      return { workflow_runs: f.latest };
    },
    source: async (path, method = 'GET') => {
      assert.equal(method, 'GET', 'The source token is strictly read-only');
      assert.ok(
        [sourcePath, ...activeStatuses.map((s) => `${sourcePath}/runs?status=${s}&per_page=1`)].includes(path),
        `Source callback must never access another repo/workflow: ${path}`,
      );
      f.sourceCalls.push(path);
      if (path === sourcePath) return { id: SOURCE_WORKFLOW, name: 'Build Main', state: f.state };
      const active = path.includes(`status=${f.active}&`);
      return { total_count: active ? 1 : 0, workflow_runs: active ? [{ id: 1 }] : [] };
    },
  };
  return f;
}

test('handoff reads only the fixed source workflow and checks every active status, then rechecks disabled', async () => {
  assert.deepEqual([TARGET, SOURCE, SOURCE_WORKFLOW], ['bk201-/personal-hub', 'bk201-/tg-news-reader', 249856757]);
  const f = guardFixture();
  await verifyHandoff(f.options);
  assert.equal(f.sourceCalls.length, 7);
  assert.equal(f.sourceCalls[0], f.sourceCalls.at(-1));
  for (const status of activeStatuses) assert.ok(f.sourceCalls.some((p) => p.includes(`status=${status}&`)));
});

test('handoff refuses active source runs/state, changed main, reruns and superseding CI', async (t) => {
  const denied = async () => {
    throw new Error('permission denied');
  };
  const cases = [
    ...activeStatuses.map((active) => [active, '', { active }, /outstanding/]),
    ...['active', 'disabled_inactivity'].map((state) => [state, '', { state }, /disabled manually/]),
    ['main changed', '', { main: otherSha }, /no longer main/],
    ['CI rerun', 'run', { run_attempt: 3 }, /no longer valid/],
    ['superseded', '', { latest: [ciRun(), ciRun({ id: 102 })] }, /superseded/],
    ['approval absent', 'options', { mode: '' }, /approve/],
    ['source permission', 'options', { source: denied }, /permission/],
    ['target permission', 'options', { target: denied }, /permission/],
  ];
  for (const [name, path, changes, error] of cases)
    await t.test(name, async () => {
      const f = guardFixture();
      patch(f, path, changes);
      await assert.rejects(verifyHandoff(f.options), error);
    });
});

test('GitHub transport fails closed without a token or permission and never discloses response bodies', async () => {
  assert.throws(() => githubApi('', () => assert.fail('Missing token must prevent fetch')), /authorization/);
  for (const status of [401, 403, 404]) {
    const api = githubApi('fake-test-token', async (url, options) => {
      assert.equal(url, `https://api.github.com/repos/${TARGET}/branches/main`);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      return { ok: false, status, json: () => assert.fail('Do not read denied response bodies') };
    });
    await assert.rejects(api(`/repos/${TARGET}/branches/main`), new RegExp(`failed \\(${status}\\)`));
  }
});

const env = {
  DEPLOY_SHA: sha,
  ACR_LOGIN_SERVER: 'testregistry.azurecr.io',
  AZURE_CONTAINER_APP: 'news-app',
  AZURE_RESOURCE_GROUP: 'news-group',
};
const config = settings(env);
const image = `${config.server}/tg-news-reader`;
const goodHealth = { status: 'ok', db: 'ok', telegram: { sessionExpired: false, connectDelayed: false } };
const existingApp = () => ({
  mode: 'Single',
  port: 3173,
  external: true,
  fqdn: 'news.example.invalid',
  scale: { minReplicas: 1, maxReplicas: 1 },
  containers: [
    {
      name: 'news',
      image: `${image}:previous`,
      mounts: [{ mountPath: '/app/data', volumeName: 'data' }],
    },
  ],
  volumes: [{ name: 'data', storageType: 'AzureFile', storageName: 'news-storage' }],
});

test('settings and preflight preserve the existing singleton, port, image and legacy data mount', async (t) => {
  assert.deepEqual(config, { sha, server: env.ACR_LOGIN_SERVER, app: 'news-app', group: 'news-group' });
  for (const key of Object.keys(env)) assert.throws(() => settings({ ...env, [key]: '' }), /settings/);
  const app = existingApp();
  assert.equal(validateApp(app, config), app.containers[0]);
  const cases = [
    ['two containers', '', { containers: [app.containers[0], app.containers[0]] }],
    ['zero minimum', 'scale', { minReplicas: 0 }],
    ['two maximum', 'scale', { maxReplicas: 2 }],
    ['wrong port', '', { port: 3000 }],
    ['missing mount', 'containers.0', { mounts: [] }],
    ['workspace mount instead of legacy data', 'containers.0.mounts.0', { mountPath: '/app/apps/tg-news-reader/data' }],
    ['ephemeral volume', 'volumes.0', { storageType: 'EmptyDir' }],
    ['missing storage', 'volumes.0', { storageName: undefined }],
    ['unrelated image', 'containers.0', { image: `${config.server}/czech-learning:latest` }],
  ];
  for (const [name, path, changes] of cases)
    await t.test(name, () => {
      const f = azureFixture();
      patch(f.app, path, changes);
      assert.throws(() => f.deployment.preflight(), /incompatible/);
      assert.equal(f.calls.length, 1);
      assert.deepEqual(f.calls[0].slice(0, 2), ['containerapp', 'show']);
    });
});

function azureFixture(options = {}) {
  const old = `${config.app}--old`;
  const inactive = `${config.app}--inactive`;
  const f = { app: existingApp(), calls: [], events: [], waits: [], smokeCalls: 0, mode: 'Single' };
  f.revisions = [
    { name: old, active: true, images: [`${image}:previous`] },
    { name: inactive, active: false, images: [`${image}@${digest}`] },
  ];
  if (options.historyCount !== undefined) {
    f.revisions.splice(
      1,
      1,
      ...Array.from({ length: options.historyCount }, (_, index) => ({
        name: `${config.app}--history-${index}`,
        active: false,
        images: [`${image}@${digest}`],
        replicas: null,
      })),
    );
  }
  const oldNames = new Set(f.revisions.map((revision) => revision.name));
  f.replicaReads = [];
  const polls = new Map();
  const zeroProof = new Set();
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  const az = (args) => {
    f.calls.push(args);
    const command = args.slice(0, 3).join(' ');
    options.onCommand?.(command, f, args);
    if (args[0] === 'acr' && args[1] !== 'list') {
      assert.equal(value(args, '--name'), 'testregistry', 'ACR requires resource name, not login hostname');
    }
    if (command === 'containerapp show --name') return f.app;
    if (command === 'acr list') return [{ name: 'testregistry', loginServer: config.server }];
    if (command === 'acr repository show') return digest;
    if (command === 'acr repository show-tags') {
      assert.equal(value(args, '--repository'), 'tg-news-reader');
      return options.tags ?? [];
    }
    if (command === 'acr repository delete') {
      assert.match(value(args, '--image'), /^tg-news-reader@sha256:[a-f0-9]{64}$/);
      return;
    }
    if (command === 'containerapp revision list') {
      assert.ok(args.includes('--all'), 'Without --all Azure hides inactive revisions with terminating replicas');
      return structuredClone(options.inventory ? options.inventory(f) : f.revisions);
    }
    if (command === 'containerapp revision set-mode') {
      f.mode = value(args, '--mode');
      f.events.push(`mode:${f.mode}`);
      return;
    }
    if (command === 'containerapp revision deactivate') {
      assert.equal(f.mode, 'Multiple');
      f.revisions.find((r) => r.name === value(args, '--revision')).active = false;
      return;
    }
    if (command === 'containerapp replica list') {
      const name = value(args, '--revision');
      f.replicaReads.push({ name, stopped: !f.revisions.find((revision) => revision.name === old)?.active });
      const count = (polls.get(name) ?? 0) + 1;
      polls.set(name, count);
      let result;
      if (options.replicas) result = options.replicas(name, count, f);
      else if (!oldNames.has(name)) result = ['new-replica'];
      else if (options.drain === 'failure') throw new Error('Replica API failed');
      else if (options.drain === 'missing') result = undefined;
      else if (options.drain === 'timeout' || ([old, inactive].includes(name) && count < 3)) {
        result = ['terminating-replica'];
      } else result = [];
      if (result?.length === 0) {
        zeroProof.add(name);
        f.events.push(`zero:${name}`);
      }
      return result;
    }
    if (command === 'containerapp registry set') return;
    if (command === 'containerapp update --name') {
      for (const revision of f.revisions) {
        assert.ok(zeroProof.has(revision.name), 'Prove every old replica stopped BEFORE update');
      }
      assert.ok(
        f.revisions.every((r) => !r.active),
        'Never overlap active revisions',
      );
      assert.equal(value(args, '--image'), `${image}@${digest}`, 'Deploy immutable digest, not mutable SHA tag');
      f.events.push('update');
      if (options.updateFailure) throw new Error('Update failed');
      f.revisions.push({
        name: `${config.app}--${value(args, '--revision-suffix')}`,
        active: true,
        images: [`${image}@${digest}`],
      });
      return;
    }
    if (command === 'containerapp revision show') {
      return { active: true, health: options.unhealthy ? 'Unhealthy' : 'Healthy', provisioning: 'Provisioned' };
    }
    if (command === 'containerapp ingress traffic') {
      assert.equal(args[3], 'set');
      assert.equal(f.mode, 'Multiple', 'Azure traffic set must precede switching to Single');
      assert.equal(value(args, '--revision-weight'), `${f.revisions.find((revision) => revision.active).name}=100`);
      f.events.push('traffic');
      return;
    }
    assert.fail(`Unexpected Azure operation (including forbidden activation): ${command}`);
  };
  f.deployment = createDeployment(config, {
    az,
    wait: async (ms) => f.waits.push(ms),
    fetcher: async (url, request) => {
      assert.equal(url, 'https://news.example.invalid/api/health');
      assert.equal(request.redirect, 'error');
      const health = options.health?.[Math.min(f.smokeCalls, options.health.length - 1)] ?? goodHealth;
      f.smokeCalls++;
      return { status: 200, json: async () => health };
    },
  });
  f.cutover = (attempt = '2') =>
    f.deployment.cutover({
      runId: '101',
      attempt,
      mode: 'stop-before-start',
      username: 'fake-user',
      password: 'fake-password',
    });
  return f;
}

test('retained history is proved before stopping the singleton, with constant downtime replica reads', async () => {
  const downtimeReads = [];
  for (const historyCount of [100, 1]) {
    const f = azureFixture({ historyCount });
    await f.cutover();
    const beforeStop = f.replicaReads.filter((read) => !read.stopped);
    const duringStop = f.replicaReads.filter((read) => read.stopped);
    assert.equal(beforeStop.length, historyCount, 'Every historical zero proof must precede deactivation');
    assert.equal(new Set(beforeStop.map((read) => read.name)).size, historyCount);
    assert.ok(beforeStop.every((read) => read.name.includes('--history-')));
    assert.ok(duringStop.every((read) => !read.name.includes('--history-')));
    downtimeReads.push(duringStop.length);
    assert.equal(duringStop.length * 7_000, 28_000, 'Fake seven-second CLI reads must not scale with history');
  }
  assert.deepEqual(downtimeReads, [4, 4]);
});

test('historical inventory failures fail closed before any deactivation or update', async (t) => {
  for (const source of ['revisions', 'cached revisions', 'replicas']) {
    for (const failure of ['missing', 'null', 'error', 'invalid']) {
      await t.test(`${source}: ${failure}`, async () => {
        let inventories = 0;
        const invalid = () => {
          if (failure === 'error') throw new Error('Inventory API failed');
          if (failure === 'missing') return undefined;
          if (failure === 'null') return null;
          return source === 'replicas' ? { replicas: 0 } : [];
        };
        const f = azureFixture({
          historyCount: 100,
          inventory: (state) =>
            ++inventories >= (source === 'cached revisions' ? 4 : 3) && source !== 'replicas'
              ? invalid()
              : state.revisions,
          replicas: source === 'replicas' ? () => invalid() : undefined,
        });
        await assert.rejects(f.cutover(), /inventory|Inventory API/);
        assert.ok(!f.calls.some((args) => args[2] === 'deactivate' || args[1] === 'update'));
        assert.equal(f.revisions[0].active, true);
        assert.equal(f.smokeCalls, 0);
        if (source === 'cached revisions') assert.equal(f.replicaReads.length, 100);
      });
    }
  }
});

test('reactivated cached revisions block update or healthy completion on every later drain pass', async (t) => {
  for (const stage of ['registry', 'post-start', 'Single']) {
    for (const name of ['news-app--history-0', 'news-app--old']) {
      await t.test(`${stage}: ${name}`, async () => {
        let changed = false;
        const f = azureFixture({
          historyCount: 1,
          onCommand: (command, state) => {
            const ready =
              stage === 'registry'
                ? command === 'containerapp registry set'
                : command === 'containerapp revision list' &&
                  state.events.includes(stage === 'Single' ? 'mode:Single' : 'update');
            if (!changed && ready) {
              state.revisions.find((revision) => revision.name === name).active = true;
              changed = true;
            }
          },
        });
        await assert.rejects(f.cutover(), /did not stop/);
        assert.equal(changed, true);
        assert.equal(f.calls.filter((args) => args[1] === 'update').length, stage === 'registry' ? 0 : 1);
        assert.equal(f.smokeCalls, 0);
        assert.equal(f.waits.length, 20, 'Two initial termination retries plus eighteen blocked drain retries');
        assert.ok(!f.calls.some((args) => args[2] === 'activate'));
      });
    }
  }
});

test('observed reactivation or changed revision image invalidates a historical zero proof', async (t) => {
  for (const change of ['active', 'image']) {
    await t.test(change, async () => {
      let changed = false;
      let inventories = 0;
      const f = azureFixture({
        historyCount: 1,
        onCommand: (command, state) => {
          if (command === 'containerapp registry set') {
            const historical = state.revisions[1];
            if (change === 'active') historical.active = true;
            else historical.images = [`${image}:changed`];
            changed = true;
          }
          if (changed && command === 'containerapp revision list' && ++inventories === 2) {
            state.revisions[1].active = false;
          }
        },
        replicas: (name, count, state) => {
          if (state.revisions.find((revision) => revision.name === name).active) return ['running'];
          if (name.includes('--history-') && count > 1 && count < 4) return ['terminating'];
          return [];
        },
      });
      await f.cutover();
      assert.equal(f.replicaReads.filter((read) => read.name.includes('--history-')).length, 4);
      assert.equal(f.waits.length, change === 'active' ? 3 : 2);
      assert.ok(f.events.lastIndexOf('zero:news-app--history-0') < f.events.indexOf('update'));
    });
  }
});

test('disappearing revisions lose their proof, including the inventory immediately before deactivation', async (t) => {
  for (const stage of ['before-stop', 'between-passes']) {
    await t.test(stage, async () => {
      let removed;
      let absentInventories = 0;
      const f = azureFixture({
        historyCount: 1,
        onCommand: (command, state, args) => {
          if (
            (stage === 'before-stop' && command === 'containerapp revision set-mode' && args.includes('Multiple')) ||
            (stage === 'between-passes' && command === 'containerapp registry set')
          ) {
            removed = state.revisions.splice(1, 1)[0];
          }
          if (removed && command === 'containerapp revision list' && ++absentInventories === 2) {
            state.revisions.push(removed);
          }
        },
        replicas: (name, count, state) => {
          if (state.revisions.find((revision) => revision.name === name).active) return ['running'];
          return name.includes('--history-') && count === 2 ? ['terminating'] : [];
        },
      });
      await f.cutover();
      assert.equal(f.replicaReads.filter((read) => read.name.includes('--history-')).length, 3);
      assert.equal(f.waits.length, 1);
      assert.equal(f.smokeCalls, 1);
      if (stage === 'before-stop') {
        assert.ok(f.events.lastIndexOf('zero:news-app--history-0') < f.events.indexOf('update'));
      }
    });
  }
});

test('new historical or active revisions between passes require actual zero replicas before update', async (t) => {
  for (const stage of ['before-stop', 'registry']) {
    for (const active of [false, true]) {
      await t.test(`${stage}: active=${active}`, async () => {
        const name = 'news-app--new-history';
        let added = false;
        let inventories = 0;
        const f = azureFixture({
          historyCount: 1,
          onCommand: (command, state, args) => {
            if (
              (stage === 'before-stop' && command === 'containerapp revision set-mode' && args.includes('Multiple')) ||
              (stage === 'registry' && command === 'containerapp registry set')
            ) {
              state.revisions.push({ name, active, replicas: 0, images: [`${image}:retained`] });
              added = true;
            }
            if (added && command === 'containerapp revision list' && ++inventories === 2) {
              state.revisions.find((revision) => revision.name === name).active = false;
            }
          },
          replicas: (revision, count, state) => {
            if (state.revisions.find((entry) => entry.name === revision).active) return ['running'];
            return revision === name && count === 1 ? ['terminating'] : [];
          },
        });
        await f.cutover();
        assert.equal(f.replicaReads.filter((read) => read.name === name).length, 2);
        assert.equal(f.waits.length, stage === 'registry' && active ? 2 : 1);
        assert.ok(f.events.indexOf(`zero:${name}`) < f.events.indexOf('update'));
      });
    }
  }
});

test('old active revision still requires bounded real drain after historical prewarming', async (t) => {
  for (const failure of ['timeout', 'missing', 'error']) {
    await t.test(failure, async () => {
      const f = azureFixture({
        historyCount: 100,
        replicas: (name) => {
          if (name.includes('--history-')) return [];
          if (failure === 'error') throw new Error('Replica API failed');
          return failure === 'missing' ? undefined : ['terminating'];
        },
      });
      await assert.rejects(f.cutover(), /did not stop|replica inventory|Replica API/);
      assert.equal(f.revisions[0].active, false);
      assert.equal(f.replicaReads.filter((read) => !read.stopped).length, 100);
      assert.equal(f.replicaReads.filter((read) => read.stopped).length, failure === 'timeout' ? 18 : 1);
      assert.equal(f.waits.length, failure === 'timeout' ? 18 : 0);
      assert.ok(!f.calls.some((args) => args[1] === 'update' || args[2] === 'activate'));
    });
  }
});

test('zero proofs never survive another cutover on the same deployment instance', async (t) => {
  for (const failure of [false, true]) {
    await t.test(failure ? 'second inventory fails' : 'second cutover succeeds', async () => {
      let second = false;
      const f = azureFixture({
        historyCount: 1,
        replicas: (name, _count, state) => {
          if (second && failure && name.includes('--history-')) return undefined;
          return state.revisions.find((revision) => revision.name === name).active ? ['running'] : [];
        },
      });
      await f.cutover();
      const firstNext = f.revisions.at(-1);
      const calls = f.calls.length;
      second = true;
      if (failure) {
        await assert.rejects(f.cutover('3'), /replica inventory/);
        assert.equal(firstNext.active, true);
        assert.ok(!f.calls.slice(calls).some((args) => args[2] === 'deactivate' || args[1] === 'update'));
      } else {
        await f.cutover('3');
        assert.equal(firstNext.active, false);
        assert.equal(f.smokeCalls, 2);
      }
      assert.equal(f.replicaReads.filter((read) => read.name.includes('--history-')).length, 2);
    });
  }
});

test('cutover polls active AND inactive old replicas, deploys digest, sets traffic before Single, then smokes', async () => {
  const f = azureFixture();
  await f.cutover();
  const transitions = f.events.filter((e) => !e.startsWith('zero:'));
  assert.deepEqual(transitions, ['mode:Multiple', 'update', 'traffic', 'mode:Single']);
  assert.ok(f.events.indexOf('zero:news-app--inactive') < f.events.indexOf('update'));
  assert.ok(f.waits.length >= 2, 'Inactive terminating replicas must be polled rather than ignored');
  assert.ok(f.waits.every((ms) => ms === 10_000));
  assert.equal(f.smokeCalls, 1);
  assert.equal(f.revisions.filter((r) => r.active).length, 1);
});

test('drain API failure, timeout or missing replica inventory never permits update or rollback', async (t) => {
  for (const [drain, error] of [
    ['failure', /Replica API/],
    ['timeout', /did not stop/],
    ['missing', /replica inventory/],
  ]) {
    await t.test(drain, async () => {
      const f = azureFixture({ drain });
      await assert.rejects(f.cutover(), error);
      assert.ok(!f.calls.some((c) => c[1] === 'update' || c[2] === 'activate'));
      assert.equal(f.smokeCalls, 0);
      if (drain === 'timeout') assert.equal(f.waits.length, 18);
    });
  }
});

test('update, readiness and smoke failure never automatically restart an old revision', async (t) => {
  for (const [name, options, error] of [
    ['update', { updateFailure: true }, /Update failed/],
    ['readiness', { unhealthy: true }, /failed readiness/],
    ['smoke', { health: [{ ...goodHealth, db: 'error' }] }, /smoke test failed/],
  ])
    await t.test(name, async () => {
      const f = azureFixture(options);
      await assert.rejects(f.cutover(), error);
      assert.equal(f.calls.filter((c) => c[1] === 'update').length, 1);
      assert.ok(!f.calls.some((c) => c[2] === 'activate'));
      assert.ok(f.revisions.slice(0, 2).every((r) => !r.active));
      if (name === 'smoke') assert.equal(f.smokeCalls, 18);
    });
});

test('smoke waits for exact status/db ok and explicit sessionExpired/connectDelayed false', async () => {
  const health = [
    { ...goodHealth, status: 'starting' },
    { ...goodHealth, db: 'error' },
    { ...goodHealth, telegram: { sessionExpired: true, connectDelayed: false } },
    { ...goodHealth, telegram: { sessionExpired: false, connectDelayed: true } },
    { status: 'ok', db: 'ok' },
    { ...goodHealth, telegram: {} },
    goodHealth,
  ];
  const f = azureFixture({ health });
  await f.cutover();
  assert.equal(f.smokeCalls, health.length);
  assert.ok(f.waits.length >= health.length - 1);
});

const tagsFixture = (count) =>
  Array.from({ length: count }, (_, i) => ({
    name: (i + 1).toString(16).padStart(40, '0'),
    digest: `sha256:${(i + 1).toString(16).padStart(64, '0')}`,
  }));

test('image retention preserves newest five, inactive revision tags/digests and operator aliases; deletes at most twenty', () => {
  const tags = tagsFixture(35);
  tags.push({ name: 'operator-recovery', digest: tags[32].digest });
  const revisions = [`${image}:${tags[34].name}`, `${image}@${tags[33].digest}`];
  const candidates = imageDeletionCandidates(tags, revisions, config.server);
  assert.equal(candidates.length, 20);
  for (const tag of [...tags.slice(0, 5), ...tags.slice(32)]) assert.ok(!candidates.includes(tag.digest), tag.name);
  const small = tagsFixture(6);
  const foreign = [
    `${config.server}/czech-learning:${small[5].name}`,
    `foreign.azurecr.io/tg-news-reader@${small[5].digest}`,
  ];
  assert.deepEqual(imageDeletionCandidates(small, foreign, config.server), [small[5].digest]);
  assert.throws(() => imageDeletionCandidates([{ name: 'bad', digest: '?' }], [], config.server), /inventory/);
});

test('cleanup inventories all revisions and can only delete manifests from the fixed news repository', () => {
  const tags = tagsFixture(30);
  const f = azureFixture({ tags });
  f.revisions[1].images = [`${image}@${tags.at(-1).digest}`];
  f.deployment.cleanup();
  const deletes = f.calls.filter((c) => c.slice(0, 3).join(' ') === 'acr repository delete');
  assert.equal(deletes.length, 20);
  assert.ok(deletes.every((c) => !c.includes(`tg-news-reader@${tags.at(-1).digest}`)));
});

function backupsFixture(count = 8) {
  const f = { calls: [], deleted: [], artifacts: [], runs: new Map(), total: count };
  for (let id = 1; id <= count; id++) {
    f.artifacts.push({
      id,
      name: `tg-news-reader-image-${sha}-${id}-2`,
      workflow_run: { id },
      expired: false,
      created_at: new Date(Date.UTC(2026, 0, id)).toISOString(),
    });
    f.runs.set(id, ciRun({ id, workflow_id: 77 }));
  }
  f.api = async (path, method = 'GET') => {
    f.calls.push([path, method]);
    const base = `/repos/${TARGET}/actions`;
    if (method === 'DELETE') {
      assert.match(path, new RegExp(`^${base}/artifacts/\\d+$`));
      f.deleted.push(Number(path.split('/').at(-1)));
      return null;
    }
    assert.equal(method, 'GET');
    if (path === `${base}/workflows/deploy-tg-news-reader.yml`) {
      return { id: 77, path: '.github/workflows/deploy-tg-news-reader.yml' };
    }
    if (path.startsWith(`${base}/artifacts?`)) {
      const page = Number(new URL(`https://example.invalid${path}`).searchParams.get('page'));
      return { total_count: f.total, artifacts: f.artifacts.slice((page - 1) * 100, page * 100) };
    }
    assert.match(path, new RegExp(`^${base}/runs/\\d+$`));
    return f.runs.get(Number(path.split('/').at(-1)));
  };
  return f;
}

test('backup retention keeps newest three by creation time, not response order', async () => {
  const f = backupsFixture();
  f.artifacts.reverse();
  assert.equal(await retainBackups(f.api), 5);
  assert.deepEqual(f.deleted, [5, 4, 3, 2, 1]);
});

test('backup retention ignores foreign artifacts/workflows, forks, nonmain, expired and forged run IDs', async () => {
  const f = backupsFixture(12);
  f.artifacts[0].name = 'czech-learning-image';
  f.runs.get(2).workflow_id = 88;
  f.runs.get(3).repository.full_name = 'foreign/repository';
  f.runs.get(4).head_repository.full_name = 'foreign/fork';
  f.runs.get(5).head_branch = 'topic';
  f.artifacts[5].expired = true;
  f.artifacts[6].workflow_run.id = 99;
  f.artifacts[7].created_at = 'invalid';
  assert.equal(await retainBackups(f.api), 1);
  assert.deepEqual(f.deleted, [9]);
});

test('backup deletion is bounded to twenty, and incomplete inventories over 1000 fail closed before deletion', async () => {
  const f = backupsFixture(105);
  assert.equal(await retainBackups(f.api), 20);
  assert.equal(f.deleted.length, 20);
  assert.ok(f.calls.some(([path]) => path.endsWith('page=2')));
  assert.ok(f.deleted.every((id) => id <= 102));
  const large = backupsFixture(1001);
  await assert.rejects(retainBackups(large.api), /inventory exceeds/);
  assert.deepEqual(large.deleted, []);
});

test('workflow pins official actions, serializes news deploys and gates every job without PR triggers', () => {
  const actions = [...workflow.matchAll(/^\s+(?:- )?uses:\s+(\S+)/gm)].map((m) => m[1]);
  assert.ok(actions.length >= 5);
  for (const action of actions)
    assert.match(
      action,
      /^(?:actions\/(?:checkout|setup-node|github-script|upload-artifact)|azure\/login|docker\/login-action)@[a-f0-9]{40}$/,
    );
  assert.match(
    workflow,
    /^concurrency:\n {2}group: tg-news-reader-production\n {2}queue: max\n {2}cancel-in-progress: false$/m,
  );
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request|pull_request_target):|uses:.*download-artifact/m);
  for (const [name, job] of Object.entries(jobs)) {
    assert.match(job.split('    steps:')[0], /vars\.TG_NEWS_READER_DEPLOY_ENABLED == 'true'/, `${name} must be opt-in`);
    if (name !== 'retain-backups') assert.doesNotMatch(job, /^\s+actions: write$/m);
  }
  assert.match(jobs.deploy, /^ {4}environment: tg-news-reader-production$/m);
  assert.match(jobs.qualify, /^ {6}deployments: read$/m);
  assert.match(jobs.qualify, /^ {10}fetch-depth: 0$/m);
  assert.doesNotMatch(jobs.deploy, /^\s+actions: write$/m);
  assert.match(jobs['retain-backups'], /^\s+actions: write$/m);
  assert.doesNotMatch(jobs['retain-backups'], /secrets\.|azure\/|docker /);
});

test('only explicit manual recovery can bypass changed paths; Node runtime is explicit without dependency installs', () => {
  assert.match(workflow, /force_news_deploy:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false/);
  assert.match(
    jobs.deploy,
    /needs\.qualify\.outputs\.relevant == 'true' \|\|\n\s+\(github\.event_name == 'workflow_dispatch' && inputs\.force_news_deploy == true\)/,
  );
  for (const job of Object.values(jobs)) {
    const setup = steps(job).filter((step) => step.includes('uses: actions/setup-node@'));
    assert.equal(setup.length, 1);
    assert.match(setup[0], /node-version: ['"]24['"]/);
    assert.doesNotMatch(job, /npm (?:ci|install)/);
  }
});

test('workflow verifies before checkout and checks out only immutable verified output refs', () => {
  const qualifySteps = steps(jobs.qualify);
  assert.match(qualifySteps[0], /id: ci/);
  assert.match(qualifySteps[0], /uses: actions\/github-script@/);
  for (const [name, job] of Object.entries(jobs)) {
    const checkouts = steps(job).filter((step) => step.includes('uses: actions/checkout@'));
    assert.equal(checkouts.length, 1, name);
    const ref = name === 'qualify' ? 'steps.ci.outputs.sha' : 'needs.qualify.outputs.sha';
    assert.ok(checkouts[0].includes(`ref: \${{ ${ref} }}`), `${name} must checkout the verified SHA`);
    assert.match(checkouts[0], /persist-credentials: false/);
  }
  assert.match(jobs.qualify, /run: node --test apps\/tg-news-reader\/scripts\/ci\/deployment\.test\.mjs/);
  assert.doesNotMatch(jobs.qualify, /npm (?:ci|install)/);
});

test('shell blocks have no inline expressions; PAT is confined to source guard step env; artifacts/context are scoped', () => {
  let guardedTokens = 0;
  for (const job of Object.values(jobs)) {
    for (const step of steps(job)) {
      const shell = step.match(/^ {8}run: ([^\n]*)(?:\n((?: {10}.*\n|\n)*))?/m);
      if (shell) assert.doesNotMatch(shell[0], /\$\{\{/, 'Pass expressions through env, never shell interpolation');
      if (/secrets\.PAT_TOKEN/.test(step)) {
        guardedTokens++;
        assert.match(step, /^ {8}env:\n/m);
        assert.match(step, /^ {10}SOURCE_PAT: \$\{\{ secrets\.PAT_TOKEN \}\}$/m);
        assert.match(step, /^ {8}run: node apps\/tg-news-reader\/scripts\/ci\/guard\.mjs$/m);
      }
    }
  }
  assert.equal(guardedTokens, 3, 'Recheck before login, registry writes and cutover');
  assert.equal((workflow.match(/secrets\.PAT_TOKEN/g) ?? []).length, guardedTokens);
  assert.match(jobs.deploy, /docker build --file apps\/tg-news-reader\/Dockerfile --tag "[^"]+" \.$/m);
  const upload = steps(jobs.deploy).find((step) => step.includes('uses: actions/upload-artifact@'));
  assert.match(
    upload,
    /name: tg-news-reader-image-\$\{\{ env\.DEPLOY_SHA \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(upload, /^ {10}path: tg-news-reader-image\.tar\.gz$/m);
  assert.match(upload, /retention-days: 90/);
  assert.match(
    jobs.deploy,
    /docker save "\$ACR_LOGIN_SERVER\/tg-news-reader:\$DEPLOY_SHA" \| gzip > tg-news-reader-image\.tar\.gz/,
  );
});
