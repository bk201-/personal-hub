import { pathToFileURL } from 'node:url';

export const TARGET = 'bk201-/personal-hub';
export const SOURCE = 'bk201-/tg-news-reader';
export const SOURCE_WORKFLOW = 249856757;

export function githubApi(token, fetcher = fetch) {
  if (!token) throw new Error('Missing GitHub authorization');
  return async (path, method = 'GET') => {
    if (!path.startsWith('/repos/')) throw new Error('Unexpected API path');
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    // Do not log response bodies, headers, tokens or API client errors.
    if (!response.ok) throw new Error(`GitHub authorization/read failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
}

export async function verifyHandoff({ target, source, sha, runId, attempt, mode }) {
  if (mode !== 'stop-before-start') throw new Error('Operator must approve stop-before-start downtime');
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt)) {
    throw new Error('Invalid verified CI identity');
  }
  const main = await target(`/repos/${TARGET}/branches/main`);
  if (main.commit?.sha !== sha) throw new Error('Deployment SHA is no longer main');
  const run = await target(`/repos/${TARGET}/actions/runs/${runId}`);
  const workflow = await target(`/repos/${TARGET}/actions/workflows/${run.workflow_id}`);
  if (
    workflow.name !== 'CI' ||
    workflow.state !== 'active' ||
    !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path) ||
    run.name !== 'CI' ||
    String(run.id) !== runId ||
    String(run.run_attempt) !== attempt ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.head_sha !== sha ||
    run.head_branch !== 'main' ||
    run.repository?.full_name !== TARGET ||
    run.head_repository?.full_name !== TARGET ||
    !['push', 'workflow_dispatch'].includes(run.event)
  ) {
    throw new Error('CI approval is no longer valid');
  }
  const latest = await target(
    `/repos/${TARGET}/actions/workflows/${run.workflow_id}/runs?branch=main&head_sha=${sha}&per_page=100`,
  );
  if (
    !Array.isArray(latest.workflow_runs) ||
    latest.workflow_runs.some(
      (candidate) =>
        candidate.id > run.id &&
        ['push', 'workflow_dispatch'].includes(candidate.event) &&
        candidate.head_repository?.full_name === TARGET,
    )
  ) {
    throw new Error('CI approval was superseded');
  }
  const old = await source(`/repos/${SOURCE}/actions/workflows/${SOURCE_WORKFLOW}`);
  if (old.id !== SOURCE_WORKFLOW || old.name !== 'Build Main' || old.state !== 'disabled_manually') {
    throw new Error('Source Build Main must be disabled manually before migration');
  }
  // Disabling a workflow does not stop queued, waiting-for-approval or live runs.
  // Check every nonterminal REST status, not just the latest page of history.
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const runs = await source(`/repos/${SOURCE}/actions/workflows/${SOURCE_WORKFLOW}/runs?status=${status}&per_page=1`);
    if (runs.total_count !== 0 || !Array.isArray(runs.workflow_runs) || runs.workflow_runs.length !== 0) {
      throw new Error('Source deployment has outstanding runs or cannot be verified');
    }
  }
  const stillDisabled = await source(`/repos/${SOURCE}/actions/workflows/${SOURCE_WORKFLOW}`);
  if (stillDisabled.state !== 'disabled_manually') throw new Error('Source workflow changed during handoff check');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyHandoff({
      target: githubApi(process.env.GH_TOKEN),
      source: githubApi(process.env.SOURCE_PAT),
      sha: process.env.DEPLOY_SHA,
      runId: process.env.CI_RUN_ID,
      attempt: process.env.CI_RUN_ATTEMPT,
      mode: process.env.CUTOVER_MODE,
    });
    console.log('Current-main CI and read-only source deployment handoff verified.');
  } catch {
    console.error(
      'Deployment guard failed. Check current-main CI, source workflow permissions/state and cutover approval.',
    );
    process.exitCode = 1;
  }
}
