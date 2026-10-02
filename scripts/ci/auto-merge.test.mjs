import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoMerge, changesAutomation } from './auto-merge.mjs';

function fixture() {
  const repository = 'owner/repository';
  const head = 'a'.repeat(40);
  const run = {
    id: 123,
    workflow_id: 456,
    run_attempt: 1,
    name: 'CI',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: head,
    head_branch: 'feature',
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    pull_requests: [{ number: 7 }],
  };
  const pr = {
    number: 7,
    user: { login: 'owner' },
    head: { sha: head, ref: 'feature', repo: { full_name: repository } },
    base: { ref: 'main', repo: { full_name: repository } },
    draft: false,
    state: 'open',
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    changed_files: 1,
  };
  const state = {
    run,
    pr,
    workflow: { id: 456, path: '.github/workflows/ci.yml', state: 'active' },
    jobs: [{ name: 'Build & Lint', status: 'completed', conclusion: 'success' }],
    files: [{ filename: 'apps/czech-learning/src/example.ts' }],
    calls: [],
    beforeCall: () => {},
    merge: () => {
      state.pr.merged = true;
      state.pr.state = 'closed';
      state.pr.merge_commit_sha = 'b'.repeat(40);
    },
    dispatch: () => '',
  };
  state.input = {
    event: { repository: { full_name: repository, owner: { login: 'owner' } }, workflow_run: structuredClone(run) },
    repository,
    owner: 'owner',
    enabled: 'true',
    log: () => {},
    gh: (args) => {
      state.calls.push(args);
      state.beforeCall(args);
      if (args.includes('PUT')) {
        state.merge(args);
        return JSON.stringify({ merged: state.pr.merged });
      }
      if (args[0] === 'workflow') return state.dispatch(args);
      const path = args[1];
      if (path.endsWith('actions/workflows/ci.yml')) return JSON.stringify(state.workflow);
      if (path.endsWith('actions/runs/123')) return JSON.stringify(state.run);
      if (path.endsWith('pulls/7')) return JSON.stringify(state.pr);
      if (path.endsWith('/jobs?per_page=100')) return JSON.stringify([{ jobs: state.jobs }]);
      if (path.endsWith('/files?per_page=100')) return JSON.stringify([state.files]);
      throw new Error(`Unexpected API request: ${path}`);
    },
  };
  return state;
}

const writes = (state) => state.calls.filter((args) => args[0] !== 'api' || args.includes('PUT'));

test('owner is the original author, not the event actor; merge is exact-head squash then main dispatch', () => {
  const state = fixture();
  state.input.event.sender = { login: 'not-the-owner' };
  assert.equal(autoMerge(state.input), 'dispatched');
  assert.deepEqual(writes(state), [
    [
      'api',
      '--method',
      'PUT',
      'repos/owner/repository/pulls/7/merge',
      '-f',
      'merge_method=squash',
      '-f',
      `sha=${'a'.repeat(40)}`,
    ],
    ['workflow', 'run', 'ci.yml', '--repo', 'owner/repository', '--ref', 'main'],
  ]);
  assert.ok(
    state.calls.filter((args) => args[1]?.includes('per_page=100')).every((args) => args.includes('--paginate')),
  );
});

const rejected = {
  'disabled opt-in': (s) => (s.input.enabled = undefined),
  'nonliteral opt-in': (s) => (s.input.enabled = 'TRUE'),
  'wrong repository': (s) => (s.input.repository = 'other/repository'),
  'wrong owner identity': (s) => (s.input.owner = 'other'),
  'wrong workflow ID': (s) => (s.run.workflow_id += 1),
  'wrong workflow path': (s) => (s.workflow.path = '.github/workflows/fake.yml'),
  'disabled CI': (s) => (s.workflow.state = 'disabled_manually'),
  'push CI': (s) => (s.run.event = 'push'),
  'manual CI': (s) => (s.run.event = 'workflow_dispatch'),
  'failed CI': (s) => (s.run.conclusion = 'failure'),
  'cancelled CI': (s) => (s.run.conclusion = 'cancelled'),
  'in-progress CI': (s) => (s.run.status = 'in_progress'),
  'stale attempt': (s) => (s.run.run_attempt += 1),
  'stale run head': (s) => (s.run.head_sha = 'c'.repeat(40)),
  'fork CI': (s) => (s.run.head_repository.full_name = 'fork/repository'),
  'missing PR association': (s) => (s.run.pull_requests = []),
  'ambiguous PR association': (s) => s.run.pull_requests.push({ number: 8 }),
  'nonowner original author': (s) => (s.pr.user.login = 'contributor'),
  'fork PR': (s) => (s.pr.head.repo.full_name = 'fork/repository'),
  'wrong base repository': (s) => (s.pr.base.repo.full_name = 'other/repository'),
  'non-main base': (s) => (s.pr.base.ref = 'release'),
  'draft PR': (s) => (s.pr.draft = true),
  'closed unmerged PR': (s) => (s.pr.state = 'closed'),
  'stale current PR head': (s) => (s.pr.head.sha = 'c'.repeat(40)),
  'changed branch name': (s) => (s.pr.head.ref = 'other'),
  'missing aggregate': (s) => (s.jobs = []),
  'failed aggregate': (s) => (s.jobs[0].conclusion = 'failure'),
  'skipped aggregate': (s) => (s.jobs[0].conclusion = 'skipped'),
  'incomplete aggregate': (s) => (s.jobs[0].status = 'in_progress'),
  'duplicate aggregate': (s) => s.jobs.push({ ...s.jobs[0] }),
  'migration workflow change': (s) => (s.files[0].filename = '.github/workflows/auto-merge.yml'),
  'CI workflow change': (s) => (s.files[0].filename = '.github/workflows/ci.yml'),
  'helper change': (s) => (s.files[0].filename = 'scripts/ci/auto-merge.mjs'),
  'app-local deployment helper change': (s) => (s.files[0].filename = 'apps/tg-news-reader/scripts/ci/guard.mjs'),
  'renamed app-local deployment helper': (s) =>
    (s.files[0].previous_filename = 'apps/tg-news-reader/scripts/ci/azure.mjs'),
  'test runner change': (s) => (s.files[0].filename = 'scripts/test.mjs'),
  'renamed automation file': (s) => (s.files[0].previous_filename = '.github/workflows/ci.yml'),
  'incomplete file inventory': (s) => (s.pr.changed_files = 3001),
  'unknown mergeability': (s) => (s.pr.mergeable = null),
  'blocked by branch protection': (s) => (s.pr.mergeable_state = 'blocked'),
  'behind main': (s) => (s.pr.mergeable_state = 'behind'),
};

for (const [name, mutate] of Object.entries(rejected)) {
  test(`refuses ${name} without any writes`, () => {
    const state = fixture();
    mutate(state);
    assert.equal(autoMerge(state.input), 'skipped');
    assert.deepEqual(writes(state), []);
  });
}

for (const subject of ['PR head', 'CI attempt']) {
  test(`revalidates ${subject} after changed-file pagination`, () => {
    const state = fixture();
    state.beforeCall = (args) => {
      if (args[1]?.endsWith('/files?per_page=100')) {
        if (subject === 'PR head') state.pr.head.sha = 'c'.repeat(40);
        else state.run.run_attempt += 1;
      }
    };
    assert.equal(autoMerge(state.input), 'skipped');
    assert.deepEqual(writes(state), []);
  });
}

test('atomic head mismatch or merge refusal never dispatches CI', () => {
  const state = fixture();
  state.merge = () => {
    throw new Error('head mismatch');
  };
  assert.throws(() => autoMerge(state.input), /head mismatch/);
  assert.equal(writes(state).length, 1);
});

test('REST merge refusals do not pretend to have merged and never dispatch', () => {
  const state = fixture();
  state.merge = () => {};
  assert.throws(() => autoMerge(state.input), /immediate matching merge/);
  assert.equal(writes(state).length, 1);
});

test('dispatch failure is visible and rerunning recovers without merging again', () => {
  const state = fixture();
  state.dispatch = () => {
    throw new Error('dispatch failed');
  };
  assert.throws(() => autoMerge(state.input), /dispatch failed/);
  assert.equal(state.pr.merged, true);
  state.calls = [];
  state.dispatch = () => '';
  assert.equal(autoMerge(state.input), 'dispatched');
  assert.deepEqual(writes(state), [['workflow', 'run', 'ci.yml', '--repo', 'owner/repository', '--ref', 'main']]);
});

test('paginated API errors fail closed', () => {
  const state = fixture();
  state.beforeCall = (args) => {
    if (args.includes('--paginate')) throw new Error('API unavailable');
  };
  assert.throws(() => autoMerge(state.input), /API unavailable/);
  assert.deepEqual(writes(state), []);
});

test('ordinary app changes do not trip the manual automation review gate', () => {
  assert.equal(changesAutomation([{ filename: 'apps/tg-news-reader/src/client/App.tsx' }]), false);
});
