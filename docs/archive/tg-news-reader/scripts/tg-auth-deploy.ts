/**
 * Authenticate with Telegram, update .env, optionally push session to Azure.
 *
 * Usage:
 *   npm run tg:auth:deploy +79001234567
 *   npm run tg:auth:deploy +79001234567 my2faPassword
 *   npm run tg:auth:deploy +79001234567 my2faPassword deploy
 *
 * Positional args:
 *   1. Phone number with country code (required)
 *   2. 2FA password (optional — use "-" to skip, prompts if Telegram requires it)
 *   3. "deploy" — update Azure secret + restart container (optional)
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const API_ID = parseInt(process.env.TG_API_ID || '0', 10);
const API_HASH = process.env.TG_API_HASH || '';

if (!API_ID || !API_HASH) {
  console.error('❌ TG_API_ID and TG_API_HASH must be set in .env');
  process.exit(1);
}

// ── Parse CLI args (positional) ─────────────────────────────────────────
const args = process.argv.slice(2);
const phone = args[0];
const password = args[1] && args[1] !== '-' && args[1] !== 'deploy' ? args[1] : undefined;
const deploy = args.includes('deploy');

if (!phone || phone.startsWith('-')) {
  console.error('❌ Usage: npm run tg:auth:deploy <phone> [password|-] [deploy]');
  console.error('   Example: npm run tg:auth:deploy +79001234567');
  console.error('   Example: npm run tg:auth:deploy +79001234567 my2fa deploy');
  console.error('   Example: npm run tg:auth:deploy +79001234567 - deploy');
  process.exit(1);
}

const AZURE_APP = 'tg-news-reader';
const AZURE_RG = 'personal-apps-rg';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve));

// ── Update .env file ────────────────────────────────────────────────────
function updateEnvFile(session: string) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf-8');
  } catch {
    // .env doesn't exist yet
  }

  if (content.match(/^TG_SESSION=.*/m)) {
    content = content.replace(/^TG_SESSION=.*/m, `TG_SESSION=${session}`);
  } else {
    content = content.trimEnd() + `\nTG_SESSION=${session}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log('✅ .env updated with new TG_SESSION');
}

// ── Azure deploy ────────────────────────────────────────────────────────
function deployToAzure(session: string) {
  console.log('\n☁️  Updating Azure secret...');

  try {
    // Update the secret value
    execSync(
      `az containerapp secret set --name ${AZURE_APP} --resource-group ${AZURE_RG} --secrets tg-session="${session}"`,
      { stdio: 'inherit' },
    );
    console.log('✅ Azure secret "tg-session" updated');

    // Get active revision name
    console.log('\n🔄 Restarting container...');
    const revision = execSync(
      `az containerapp revision list --name ${AZURE_APP} --resource-group ${AZURE_RG} --query "[?properties.active].name | [0]" -o tsv`,
      { encoding: 'utf-8' },
    ).trim();

    if (revision) {
      execSync(
        `az containerapp revision restart --name ${AZURE_APP} --resource-group ${AZURE_RG} --revision ${revision}`,
        { stdio: 'inherit' },
      );
      console.log(`✅ Revision "${revision}" restarted`);
    } else {
      console.warn(
        '⚠️  No active revision found — container may be scaled to zero. It will pick up the new secret on next start.',
      );
    }
  } catch (err) {
    console.error('❌ Azure deploy failed. Is `az` CLI installed and logged in?');
    console.error('   Run: az login');
    throw err;
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔑 Telegram Authentication');
  console.log(`📱 Phone: ${phone}`);
  console.log(`🔐 2FA: ${password ? '(provided)' : '(will prompt if needed)'}`);
  console.log(`☁️  Deploy: ${deploy ? 'yes' : 'no (local only)'}\n`);

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => Promise.resolve(phone),
    password: async () => {
      if (password) return password;
      return question('🔐 Enter your 2FA password: ');
    },
    phoneCode: async () => question('📬 Enter the code from Telegram: '),
    onError: (err) => console.error('Error:', err),
  });

  const session = client.session.save() as unknown as string;
  console.log('\n✅ Authentication successful!');

  await client.disconnect();
  rl.close();

  // Always update local .env
  updateEnvFile(session);

  // Optionally deploy to Azure
  if (deploy) {
    deployToAzure(session);
  } else {
    console.log('\nℹ️  To also deploy to Azure, add "deploy" as last argument');
  }

  console.log('\n🎉 Done!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  rl.close();
  process.exit(1);
});
