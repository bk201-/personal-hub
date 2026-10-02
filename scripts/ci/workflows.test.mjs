import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const ciText = read('.github/workflows/ci.yml');
const mergeText = read('.github/workflows/auto-merge.yml');
const ci = parse(ciText);
const merge = parse(mergeText);
const steps = (workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps);
const commands = (job) => job.steps.flatMap((step) => (step.run ? [step.run] : []));

test('CI covers every PR, main pushes and manual main dispatch without path skips', () => {
  assert.equal(ci.name, 'CI');
  assert.deepEqual(ci.on, {
    pull_request: { types: ['opened', 'synchronize', 'reopened', 'ready_for_review'] },
    push: { branches: ['main'] },
    workflow_dispatch: null,
  });
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.equal(ci.concurrency['cancel-in-progress'], true);
  assert.match(ci.concurrency.group, /pull_request.number \|\| github.ref/);
  assert.doesNotMatch(ciText, /secrets\.|github\.token|pull_request_target|paths-ignore:|continue-on-error:|--push/);
  for (const job of Object.values(ci.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-latest');
    assert.equal(job.permissions, undefined);
    assert.ok(job['timeout-minutes'] > 0);
  }
});

test('all real workspaces have independent CI and capability-aware commands', () => {
  const manifests = ['apps', 'packages'].flatMap((directory) =>
    readdirSync(new URL(`${directory}/`, root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          return [JSON.parse(read(`${directory}/${entry.name}/package.json`))];
        } catch (error) {
          if (error.code === 'ENOENT') return [];
          throw error;
        }
      }),
  );
  assert.deepEqual(ci.jobs.workspace.strategy.matrix.workspace.toSorted(), manifests.map((p) => p.name).toSorted());
  assert.equal(ci.jobs.workspace.strategy['fail-fast'], false);
  assert.equal(ci.jobs.workspace.if, undefined);
  const runs = commands(ci.jobs.workspace);
  assert.deepEqual(runs, [
    'npm ci',
    'npm run build:shared',
    'npm run typecheck --workspace "$WORKSPACE" --if-present',
    'npm run build --workspace "$WORKSPACE"',
    'npm run build:server --workspace "$WORKSPACE" --if-present',
    'npm test -- --workspace "$WORKSPACE"',
  ]);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts.test, /node scripts\/test.mjs$/);
  for (const manifest of manifests) assert.ok(manifest.scripts.build);
  for (const command of commands(ci.jobs.quality).filter((run) => run.startsWith('npm run '))) {
    assert.ok(scripts[command.slice('npm run '.length)]);
  }
  assert.ok(commands(ci.jobs.quality).includes('npm run lint'));
  assert.ok(
    commands(ci.jobs.quality).indexOf('npm run build:shared') < commands(ci.jobs.quality).indexOf('npm run lint'),
  );
  assert.ok(commands(ci.jobs.quality).includes('npm run format:check'));
  assert.ok(commands(ci.jobs.quality).includes('npm run test:ci'));
  assert.match(scripts['test:ci'], /scripts\/ci\/\*\.test\.mjs/);
  assert.match(scripts['test:ci'], /apps\/tg-news-reader\/scripts\/ci\/\*\.test\.mjs/);
});

test('Docker verifies both existing app Dockerfiles using root context with no publish', () => {
  assert.deepEqual(ci.jobs.docker.strategy.matrix.app, ['tg-news-reader', 'czech-learning']);
  assert.equal(ci.jobs.docker.strategy['fail-fast'], false);
  assert.equal(ci.jobs.docker.if, undefined);
  assert.deepEqual(commands(ci.jobs.docker), [
    'docker build --file "apps/$APP/Dockerfile" --tag "personal-hub-$APP:ci" .',
  ]);
  for (const app of ci.jobs.docker.strategy.matrix.app) {
    assert.match(read(`apps/${app}/Dockerfile`), /npm run build:shared/);
  }
});

test('stable required aggregate runs even after failures and rejects skipped dependencies', () => {
  const aggregate = ci.jobs.required;
  assert.equal(aggregate.name, 'Build & Lint');
  assert.equal(aggregate.if, '${{ always() }}');
  assert.deepEqual(
    aggregate.needs.toSorted(),
    Object.keys(ci.jobs)
      .filter((key) => key !== 'required')
      .toSorted(),
  );
  assert.equal(aggregate.env.RESULTS, '${{ toJSON(needs) }}');
  assert.match(commands(aggregate)[0], /jq --exit-status 'length == 3 and all\(\.\[\]; \.result == "success"\)'/);
});

test('official action versions are immutable and every checkout disables stored credentials', () => {
  const pins = new Set([
    'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09',
    'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444',
  ]);
  for (const step of [...steps(ci), ...steps(merge)].filter((step) => step.uses)) {
    assert.ok(pins.has(step.uses), step.uses);
    if (step.uses.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false);
    else assert.equal(step.with['node-version'], '24.15.0');
  }
});

test('privileged automation only loads trusted workflow revision and never PR code or caches', () => {
  assert.deepEqual(merge.on, { workflow_run: { workflows: ['CI'], types: ['completed'] } });
  assert.deepEqual(merge.permissions, { contents: 'read' });
  assert.equal(merge.concurrency['cancel-in-progress'], false);
  assert.equal(merge.concurrency.queue, 'max');
  assert.match(merge.jobs.merge.if, /vars.AUTO_MERGE_OWNER_PRS == 'true'/);
  assert.match(merge.jobs.merge.if, /workflow_run.event == 'pull_request'/);
  assert.match(merge.jobs.merge.if, /workflow_run.conclusion == 'success'/);
  assert.match(merge.jobs.merge.if, /workflow_run.head_repository.full_name == github.repository/);
  assert.deepEqual(merge.jobs.merge.permissions, { actions: 'write', contents: 'write', 'pull-requests': 'write' });
  assert.equal(steps(merge)[0].with.ref, '${{ github.workflow_sha }}');
  assert.equal(steps(merge)[1].with['package-manager-cache'], false);
  assert.deepEqual(commands(merge.jobs.merge), ['node scripts/ci/auto-merge.mjs']);
  assert.equal(steps(merge).at(-1).env.GH_TOKEN, '${{ github.token }}');
  assert.doesNotMatch(mergeText, /secrets\.|pull_request_target|npm ci|^\s+cache:|download-artifact/m);
});
