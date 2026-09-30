import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import packageJson from '../../../package.json' with { type: 'json' };

const APP_VERSION: string = packageJson.version;

export const versionRouter = new Hono();

versionRouter.get('/', (c) => {
  c.header('Cache-Control', 'no-store');
  let buildId = process.env.APP_BUILD_ID;
  if (!buildId && process.env.NODE_ENV === 'production') {
    try {
      const artifact = JSON.parse(readFileSync(new URL('../../../dist/build-id.json', import.meta.url), 'utf8')) as {
        buildId?: unknown;
      };
      if (typeof artifact.buildId === 'string') buildId = artifact.buildId;
    } catch {
      /* An incomplete production artifact must not report a false identity. */
    }
  }
  buildId ??= process.env.NODE_ENV === 'production' ? undefined : 'tg-news-reader:development';
  if (!buildId) return c.json({ error: 'Build identity is not configured' }, 503);
  return c.json({ version: APP_VERSION, buildId });
});

export default versionRouter;
