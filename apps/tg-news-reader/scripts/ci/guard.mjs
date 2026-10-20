import { pathToFileURL } from 'node:url';

export const TARGET = 'bk201-/personal-hub';

// Only errors constructed here may contribute text to public deployment logs.
class GuardError extends Error {}

export function githubApi(token, fetcher = fetch) {
  if (!token) throw new GuardError('Missing GitHub authorization');
  return async (path, method = 'GET') => {
    if (!path.startsWith('/repos/')) throw new GuardError('Unexpected API path');
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    }).catch((error) => {
      if (error?.name === 'TimeoutError') throw new GuardError('GitHub request timed out');
      if (error?.name === 'AbortError') throw new GuardError('GitHub request aborted');
      throw new GuardError('GitHub request failed (network or redirect error; details suppressed)');
    });
    // Do not log response bodies, headers, tokens or API client errors.
    if (!response.ok) {
      const status = Number.isInteger(response.status) ? response.status : 'unknown';
      throw new GuardError(`GitHub authorization/read failed (HTTP ${status})`);
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new GuardError('GitHub response was not valid JSON (body suppressed)');
    }
  };
}

export async function verifyDeployment({ target, sha, runId, attempt, mode, onStep = () => {} }) {
  onStep('Validate cutover mode');
  if (mode !== 'stop-before-start') throw new GuardError('Operator must approve stop-before-start downtime');
  onStep('Validate CI identity');
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt)) {
    throw new GuardError('Invalid verified CI identity');
  }
  onStep('Read current main (GH_TOKEN)');
  const main = await target(`/repos/${TARGET}/branches/main`);
  if (main.commit?.sha !== sha) throw new GuardError('Deployment SHA is no longer main');
  onStep('Read CI run (GH_TOKEN)');
  const run = await target(`/repos/${TARGET}/actions/runs/${runId}`);
  onStep('Read CI workflow (GH_TOKEN)');
  const workflow = await target(`/repos/${TARGET}/actions/workflows/${run.workflow_id}`);
  onStep('Validate current CI approval');
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
    throw new GuardError('CI approval is no longer valid');
  }
  onStep('Check for superseding CI (GH_TOKEN)');
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
    throw new GuardError('CI approval was superseded');
  }
}

export async function runGuard({
  env = process.env,
  fetcher = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  let step = 'Initialize deployment guard';
  const onStep = (label) => {
    step = label;
    log(`[deployment-guard] ${step}`);
  };
  try {
    onStep('Initialize target API (GH_TOKEN)');
    const target = githubApi(env.GH_TOKEN, fetcher);
    await verifyDeployment({
      target,
      sha: env.DEPLOY_SHA,
      runId: env.CI_RUN_ID,
      attempt: env.CI_RUN_ATTEMPT,
      mode: env.CUTOVER_MODE,
      onStep,
    });
    log('Current-main CI and cutover approval verified.');
    return 0;
  } catch (error) {
    const reason = error instanceof GuardError ? error.message : 'Unexpected error (details suppressed)';
    logError(`Deployment guard failed at "${step}": ${reason}.`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runGuard();
}
