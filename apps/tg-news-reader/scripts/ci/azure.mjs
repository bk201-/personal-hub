import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const IMAGE_REPOSITORY = 'tg-news-reader';
const DATA_MOUNT = '/app/data';
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function azureCli(args, query) {
  try {
    const output = execFileSync(
      'az',
      [...args, '--only-show-errors', '--output', query ? 'json' : 'none', ...(query ? ['--query', query] : [])],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return query ? JSON.parse(output) : undefined;
  } catch {
    // CLI failures can include the complete command or resource response. Never
    // forward them: registry credentials and existing app secrets stay private.
    throw new Error(`Azure operation failed: ${args.slice(0, 2).join(' ')}`);
  }
}

export function settings(env) {
  if (
    !SHA.test(env.DEPLOY_SHA) ||
    !/^[a-z0-9][a-z0-9.-]*\.azurecr\.io$/.test(env.ACR_LOGIN_SERVER ?? '') ||
    !/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(env.AZURE_CONTAINER_APP ?? '') ||
    !/^[\w.()-]{1,90}$/.test(env.AZURE_RESOURCE_GROUP ?? '')
  ) {
    throw new Error('Missing or invalid existing production target settings');
  }
  return {
    sha: env.DEPLOY_SHA,
    server: env.ACR_LOGIN_SERVER,
    app: env.AZURE_CONTAINER_APP,
    group: env.AZURE_RESOURCE_GROUP,
  };
}

export function validateApp(app, config) {
  const container = app.containers?.[0];
  const mount = container?.mounts?.find((entry) => entry.mountPath === DATA_MOUNT);
  const volume = app.volumes?.find((entry) => entry.name === mount?.volumeName);
  if (
    !['Single', 'Multiple'].includes(app.mode) ||
    app.containers?.length !== 1 ||
    typeof container?.name !== 'string' ||
    (!container.image?.startsWith(`${config.server}/${IMAGE_REPOSITORY}:`) &&
      !container.image?.startsWith(`${config.server}/${IMAGE_REPOSITORY}@`)) ||
    app.scale?.minReplicas !== 1 ||
    app.scale?.maxReplicas !== 1 ||
    app.port !== 3173 ||
    app.external !== true ||
    !/^[a-z0-9][a-z0-9.-]+$/.test(app.fqdn ?? '') ||
    !mount ||
    !['AzureFile', 'NfsAzureFile'].includes(volume?.storageType) ||
    !volume.storageName ||
    (container.command?.length ?? 0) !== 0 ||
    (container.args?.length ?? 0) !== 0
  ) {
    throw new Error(
      'Existing app is incompatible: require same news image, one container/replica, port 3173, persistent /app/data mount and image-default command',
    );
  }
  return container;
}

export function imageDeletionCandidates(tags, revisionImages, server) {
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag.name !== 'string' || !DIGEST.test(tag.digest))) {
    throw new Error('Cannot verify registry tag inventory');
  }
  // API returns newest first. Preserve five SHA tags plus EVERY retained
  // revision (even inactive rollback revisions) and any non-SHA/operator tags.
  const protectedTags = new Set(
    tags
      .filter((tag) => SHA.test(tag.name))
      .slice(0, 5)
      .map((tag) => tag.name),
  );
  const protectedDigests = new Set();
  const prefix = `${server}/${IMAGE_REPOSITORY}`;
  for (const image of revisionImages) {
    if (image.startsWith(`${prefix}:`)) protectedTags.add(image.slice(prefix.length + 1));
    if (image.startsWith(`${prefix}@`)) protectedDigests.add(image.slice(prefix.length + 1));
  }
  const groups = new Map();
  for (const tag of tags) {
    const names = groups.get(tag.digest) ?? [];
    names.push(tag.name);
    groups.set(tag.digest, names);
    if (!SHA.test(tag.name) || protectedTags.has(tag.name)) protectedDigests.add(tag.digest);
  }
  return [...groups.keys()]
    .filter((digest) => !protectedDigests.has(digest))
    .reverse()
    .slice(0, 20);
}

export function createDeployment(config, { az = azureCli, wait = sleep, fetcher = fetch } = {}) {
  const target = ['--name', config.app, '--resource-group', config.group];
  const revisionTarget = (name) => ['--revision', name, '--resource-group', config.group];
  const revisionQuery = '[].{name:name,active:properties.active,images:properties.template.containers[].image}';
  function revisions() {
    const list = az(['containerapp', 'revision', 'list', ...target, '--all'], revisionQuery);
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      list.some(
        (entry) =>
          !entry.name?.startsWith(`${config.app}--`) ||
          typeof entry.active !== 'boolean' ||
          !Array.isArray(entry.images) ||
          entry.images.length !== 1 ||
          typeof entry.images[0] !== 'string',
      )
    ) {
      throw new Error('Cannot verify existing revision inventory');
    }
    return list;
  }
  function replicas(name) {
    const list = az(['containerapp', 'replica', 'list', ...target, '--revision', name], '[].name');
    if (!Array.isArray(list)) throw new Error('Cannot verify replica inventory');
    return list;
  }
  function registry() {
    // ACR APIs require the resource NAME, not the login hostname.
    const registries = az(['acr', 'list'], '[].{name:name,loginServer:loginServer}');
    const matches = registries.filter((entry) => entry.loginServer === config.server);
    if (matches.length !== 1 || !/^[a-zA-Z0-9]+$/.test(matches[0].name)) {
      throw new Error('Cannot resolve existing ACR resource name');
    }
    return matches[0].name;
  }
  function preflight() {
    const app = az(
      ['containerapp', 'show', ...target],
      '{mode:properties.configuration.activeRevisionsMode,port:properties.configuration.ingress.targetPort,external:properties.configuration.ingress.external,fqdn:properties.configuration.ingress.fqdn,scale:properties.template.scale,containers:properties.template.containers[].{name:name,image:image,mounts:volumeMounts,command:command,args:args},volumes:properties.template.volumes}',
    );
    const container = validateApp(app, config);
    const existing = revisions();
    if (existing.filter((revision) => revision.active).length > 1) {
      throw new Error('Existing multiple active revisions require operator intervention');
    }
    return { app, container, registryName: registry() };
  }
  async function waitForDrain(except) {
    for (let attempt = 0; attempt < 18; attempt++) {
      let drained = true;
      for (const revision of revisions().filter((entry) => entry.name !== except)) {
        // Missing replica counts are NOT evidence of a stopped container. Ask
        // for the actual replica list, including inactive/terminating revisions.
        if (revision.active || replicas(revision.name).length !== 0) drained = false;
      }
      if (drained) return;
      await wait(10_000);
    }
    throw new Error('Old replicas did not stop; no new revision may be started');
  }
  async function cutover({ runId, attempt, mode, username, password }) {
    if (mode !== 'stop-before-start' || !/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt)) {
      throw new Error('Missing explicit cutover approval or run identity');
    }
    if (!username || !password) throw new Error('Missing ACR credentials');
    const { container, app, registryName } = preflight();
    const digest = az(
      ['acr', 'repository', 'show', '--name', registryName, '--image', `${IMAGE_REPOSITORY}:${config.sha}`],
      'digest',
    );
    if (!DIGEST.test(digest)) throw new Error('Cannot verify pushed image digest');
    const suffix = `r${config.sha.slice(0, 8)}-${runId}-${attempt}`;
    const next = `${config.app}--${suffix}`;
    if (revisions().some((revision) => revision.name === next)) throw new Error('Revision name already exists');

    // Single mode rolls and can overlap Telegram clients. Switch to Multiple
    // ONLY to allow deactivation of the last revision, then wait BEFORE update.
    az(['containerapp', 'revision', 'set-mode', ...target, '--mode', 'Multiple']);
    for (const revision of revisions()) {
      if (revision.active) az(['containerapp', 'revision', 'deactivate', ...revisionTarget(revision.name)]);
    }
    await waitForDrain();
    az([
      'containerapp',
      'registry',
      'set',
      ...target,
      '--server',
      config.server,
      '--username',
      username,
      '--password',
      password,
    ]);
    await waitForDrain();
    az([
      'containerapp',
      'update',
      ...target,
      '--container-name',
      container.name,
      '--image',
      `${config.server}/${IMAGE_REPOSITORY}@${digest}`,
      '--revision-suffix',
      suffix,
    ]);

    // Post-start drain is a verification, not the session-overlap guarantee.
    await waitForDrain(next);
    let healthy = false;
    for (let index = 0; index < 18; index++) {
      const revision = az(
        ['containerapp', 'revision', 'show', ...revisionTarget(next)],
        '{active:properties.active,health:properties.healthState,provisioning:properties.provisioningState}',
      );
      const count = replicas(next).length;
      if (count > 1) throw new Error('Unexpected multiple news replicas; manual intervention required');
      if (
        revision.active === true &&
        revision.health === 'Healthy' &&
        revision.provisioning === 'Provisioned' &&
        count === 1
      ) {
        healthy = true;
        break;
      }
      await wait(10_000);
    }
    if (!healthy) throw new Error('New revision failed readiness; no automatic rollback');
    // Traffic updates are only supported in Multiple mode. The target is
    // already the sole running revision; switch back to Single afterwards.
    az(['containerapp', 'ingress', 'traffic', 'set', ...target, '--revision-weight', `${next}=100`]);
    az(['containerapp', 'revision', 'set-mode', ...target, '--mode', 'Single']);
    await waitForDrain(next);
    for (let index = 0; index < 18; index++) {
      try {
        const response = await fetcher(`https://${app.fqdn}/api/health`, {
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 200) {
          const health = await response.json();
          if (
            health.status === 'ok' &&
            health.db === 'ok' &&
            health.telegram?.sessionExpired === false &&
            health.telegram?.connectDelayed === false
          ) {
            return;
          }
        } else {
          await response.body?.cancel();
        }
      } catch {
        // A bounded retry is expected while ingress picks up the new revision.
      }
      await wait(10_000);
    }
    throw new Error('Health smoke test failed; inspect the singleton before recovery');
  }
  function cleanup() {
    const registryName = registry();
    const images = revisions().flatMap((revision) => revision.images);
    const tags = az(
      [
        'acr',
        'repository',
        'show-tags',
        '--name',
        registryName,
        '--repository',
        IMAGE_REPOSITORY,
        '--detail',
        '--orderby',
        'time_desc',
      ],
      '[].{name:name,digest:digest}',
    );
    const candidates = imageDeletionCandidates(tags, images, config.server);
    for (const digest of candidates) {
      az(['acr', 'repository', 'delete', '--name', registryName, '--image', `${IMAGE_REPOSITORY}@${digest}`, '--yes']);
    }
    console.log(`News image retention completed (${candidates.length} old manifests removed; at most 20).`);
  }
  return { preflight, cutover, cleanup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const deployment = createDeployment(settings(process.env));
    switch (process.argv[2]) {
      case 'preflight':
        deployment.preflight();
        console.log('Existing news app configuration is compatible; nothing changed.');
        break;
      case 'cutover':
        await deployment.cutover({
          runId: process.env.GITHUB_RUN_ID,
          attempt: process.env.GITHUB_RUN_ATTEMPT,
          mode: process.env.CUTOVER_MODE,
          username: process.env.ACR_USERNAME,
          password: process.env.ACR_PASSWORD,
        });
        console.log('News singleton cutover and health smoke test succeeded.');
        break;
      case 'cleanup':
        deployment.cleanup();
        break;
      default:
        throw new Error('Unknown deployment operation');
    }
  } catch (error) {
    console.error(error.message);
    console.error(
      'No automatic rollback. On failure/cancellation inspect active revisions and replicas before recovery.',
    );
    process.exitCode = 1;
  }
}
