import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubApi, TARGET } from './guard.mjs';

export const PRODUCTION_ENVIRONMENT = 'tg-news-reader-production';

export async function lastSuccessfulDeployment(api) {
  for (let page = 1; page <= 10; page++) {
    const batch = await api(
      `/repos/${TARGET}/deployments?environment=${PRODUCTION_ENVIRONMENT}&per_page=100&page=${page}`,
    );
    if (
      !Array.isArray(batch) ||
      batch.some(
        (entry) =>
          !Number.isSafeInteger(entry.id) ||
          entry.id < 1 ||
          entry.environment !== PRODUCTION_ENVIRONMENT ||
          !/^[a-f0-9]{40}$/.test(entry.sha),
      )
    ) {
      throw new Error('Cannot verify deployment history');
    }
    for (const deployment of batch.toSorted((left, right) => right.id - left.id)) {
      const statuses = await api(`/repos/${TARGET}/deployments/${deployment.id}/statuses?per_page=100`);
      if (!Array.isArray(statuses) || statuses.some((status) => typeof status.state !== 'string')) {
        throw new Error('Cannot verify deployment statuses');
      }
      // Superseded deployments can have a latest "inactive" status after succeeding.
      if (statuses.some((status) => status.state === 'success')) return deployment.sha;
    }
    if (batch.length < 100) return null;
  }
  throw new Error('Deployment history exceeds bounded lookup; operator review required');
}

export function affectsNews(paths) {
  // A rename contributes both its old and new paths. Root tooling/shared changes
  // are deliberately conservative; only exclusively unrelated app changes skip.
  return paths.some((path) => !path.startsWith('apps/') || path.startsWith('apps/tg-news-reader/'));
}

export function pathsSinceDeployment(baseline, git = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  const head = git(['rev-parse', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || (baseline !== null && !/^[a-f0-9]{40}$/.test(baseline))) {
    throw new Error('Invalid deployment comparison SHA');
  }
  const args = baseline
    ? ['diff', '--no-renames', '--name-only', '-z', baseline, head]
    : ['ls-tree', '-r', '--name-only', '-z', head];
  return git(args).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseline = await lastSuccessfulDeployment(githubApi(process.env.GH_TOKEN));
  console.log(baseline ? `Comparing news changes since deployment ${baseline}.` : 'No successful news deployment yet.');
  appendFileSync(process.env.GITHUB_OUTPUT, `relevant=${affectsNews(pathsSinceDeployment(baseline))}\n`);
}
