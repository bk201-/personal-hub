import { pathToFileURL } from 'node:url';
import { githubApi, TARGET } from './guard.mjs';

const BACKUP_NAME = /^tg-news-reader-image-([a-f0-9]{40})-([1-9]\d*)-([1-9]\d*)$/;

export async function retainBackups(api) {
  const workflow = await api(`/repos/${TARGET}/actions/workflows/deploy-tg-news-reader.yml`);
  if (workflow.path !== '.github/workflows/deploy-tg-news-reader.yml' || !Number.isSafeInteger(workflow.id)) {
    throw new Error('Unexpected deployment workflow identity');
  }
  const artifacts = [];
  // Bound API work and fail closed before ANY deletion if enumeration is partial.
  for (let page = 1; page <= 10; page++) {
    const response = await api(`/repos/${TARGET}/actions/artifacts?per_page=100&page=${page}`);
    if (
      !Array.isArray(response.artifacts) ||
      !Number.isSafeInteger(response.total_count) ||
      response.total_count > 1000
    ) {
      throw new Error('Artifact inventory exceeds bounded cleanup; use 90-day expiry or operator review');
    }
    artifacts.push(...response.artifacts);
    if (response.artifacts.length < 100) break;
  }
  const owned = [];
  for (const artifact of artifacts) {
    const match = BACKUP_NAME.exec(artifact.name);
    if (!match || artifact.expired || String(artifact.workflow_run?.id) !== match[2]) continue;
    const run = await api(`/repos/${TARGET}/actions/runs/${match[2]}`);
    if (
      run.workflow_id === workflow.id &&
      run.repository?.full_name === TARGET &&
      run.head_repository?.full_name === TARGET &&
      run.head_branch === 'main' &&
      Number.isFinite(Date.parse(artifact.created_at))
    ) {
      owned.push(artifact);
    }
  }
  owned.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const removed = owned.slice(3).slice(-20);
  for (const artifact of removed) {
    await api(`/repos/${TARGET}/actions/artifacts/${artifact.id}`, 'DELETE');
  }
  return removed.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = await retainBackups(githubApi(process.env.GH_TOKEN));
    console.log(`News backup retention completed (${count} deleted; newest three retained).`);
  } catch {
    console.error('News artifact retention failed closed; 90-day artifact expiry remains configured.');
    process.exitCode = 1;
  }
}
