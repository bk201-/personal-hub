import { Hono } from 'hono';
import packageJson from '../../../package.json' with { type: 'json' };

const APP_VERSION: string = packageJson.version;

const router = new Hono();

router.get('/', (c) => {
  return c.json({ version: APP_VERSION });
});

export default router;
