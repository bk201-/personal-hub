import 'dotenv/config';
import { client } from '../src/server/db/index.js';
import { runMigration } from '../src/server/db/migrate.js';

try {
  await runMigration();
} finally {
  client.close();
}
