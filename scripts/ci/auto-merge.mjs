import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const same = (left, right) => typeof left === 'string' && left.toLowerCase() === right?.toLowerCase();
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function eligibleRun(run, event, workflow, repository) {
  return (
    workflow.path === '.github/workflows/ci.yml' &&
    workflow.state === 'active' &&
    run.workflow_id === workflow.id &&
    run.id === event.id &&
    run.run_attempt === event.run_attempt &&
    run.head_sha === event.head_sha &&
    sha(run.head_sha) &&
    run.name === 'CI' &&
    run.event === 'pull_request' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    same(run.repository?.full_name, repository) &&
    same(run.head_repository?.full_name, repository) &&
    run.pull_requests?.length === 1 &&
    Number.isSafeInteger(run.pull_requests[0].number) &&
    run.pull_requests[0].number > 0
  );
}

export function eligiblePullRequest(pr, run, repository, owner) {
  return (
    pr.number === run.pull_requests[0].number &&
    same(pr.user?.login, owner) &&
    same(pr.head?.repo?.full_name, repository) &&
    same(pr.base?.repo?.full_name, repository) &&
    pr.base.ref === 'main' &&
    pr.head.sha === run.head_sha &&
    pr.head.ref === run.head_branch &&
    pr.draft === false &&
    (pr.state === 'open' || (pr.merged === true && sha(pr.merge_commit_sha)))
  );
}

export function changesAutomation(files) {
  return files.some((file) =>
    [file.filename, file.previous_filename].some(
      (path) =>
        path &&
        (path.startsWith('.github/workflows/') ||
          path.startsWith('scripts/ci/') ||
          /^apps\/[^/]+\/scripts\/ci\//.test(path) ||
          path === 'scripts/test.mjs'),
    ),
  );
}

export function autoMerge({ event, repository, owner, enabled, gh, log = console.log }) {
  const skip = (reason) => {
    log(`Not merging: ${reason}.`);
    return 'skipped';
  };
  if (enabled !== 'true') return skip('owner automation is not opted in');
  if (!same(event.repository?.full_name, repository) || !same(event.repository?.owner?.login, owner)) {
    return skip('repository identity mismatch');
  }
  const source = event.workflow_run;
  if (!Number.isSafeInteger(source?.id)) return skip('missing workflow run');
  const prefix = `repos/${repository}`;
  const api = (path) => JSON.parse(gh(['api', `${prefix}/${path}`]));
  const pages = (path) => JSON.parse(gh(['api', `${prefix}/${path}`, '--paginate', '--slurp']));
  const workflow = api('actions/workflows/ci.yml');
  let run = api(`actions/runs/${source.id}`);
  if (!eligibleRun(run, source, workflow, repository)) return skip('CI identity, attempt or conclusion mismatch');
  const number = run.pull_requests[0].number;
  let pr = api(`pulls/${number}`);
  if (!eligiblePullRequest(pr, run, repository, owner)) return skip('PR is not an eligible current owner head');
  const jobs = pages(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`).flatMap(
    (page) => page.jobs,
  );
  const required = jobs.filter((job) => job.name === 'Build & Lint');
  if (required.length !== 1 || required[0].status !== 'completed' || required[0].conclusion !== 'success') {
    return skip('required aggregate did not succeed');
  }
  const files = pages(`pulls/${number}/files?per_page=100`).flat();
  if (files.length !== pr.changed_files || changesAutomation(files)) {
    return skip('automation changes or incomplete changed-file inventory require manual review');
  }

  // Re-fetch after pagination. The merge API's expected head makes a subsequent head change fail atomically.
  run = api(`actions/runs/${source.id}`);
  pr = api(`pulls/${number}`);
  if (!eligibleRun(run, source, workflow, repository) || !eligiblePullRequest(pr, run, repository, owner)) {
    return skip('PR or CI changed during validation');
  }
  if (!pr.merged) {
    if (pr.mergeable !== true || pr.mergeable_state !== 'clean') return skip('PR is not immediately mergeable');
    // Unlike `gh pr merge`, REST cannot silently enqueue/enable deferred auto-merge.
    const result = JSON.parse(
      gh([
        'api',
        '--method',
        'PUT',
        `${prefix}/pulls/${number}/merge`,
        '-f',
        'merge_method=squash',
        '-f',
        `sha=${run.head_sha}`,
      ]),
    );
    if (result.merged !== true) throw new Error('GitHub refused the immediate matching merge.');
    pr = api(`pulls/${number}`);
    if (!pr.merged || !eligiblePullRequest(pr, run, repository, owner)) {
      throw new Error('An immediate matching merge was not confirmed; main CI was not dispatched.');
    }
  }

  // GITHUB_TOKEN merges suppress push workflows. Dispatch always targets trusted main, not a PR ref.
  // If main advances concurrently, CI intentionally validates its newest tip (and stale CI cancels).
  gh(['workflow', 'run', 'ci.yml', '--repo', repository, '--ref', 'main']);
  log(`PR #${number} merged; CI dispatched on main.`);
  return 'dispatched';
}

if (import.meta.main) {
  autoMerge({
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    repository: process.env.GITHUB_REPOSITORY,
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    enabled: process.env.AUTO_MERGE_OWNER_PRS,
    gh: (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  });
}
