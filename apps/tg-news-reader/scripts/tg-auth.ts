/**
 * Run this script ONCE to authenticate with Telegram and get your session string.
 * Usage: npm run tg:auth
 * Copy the session string to your .env file as TG_SESSION=...
 */
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve));

async function main() {
  console.log('🔑 Telegram Authentication');
  console.log('Get your API credentials at: https://my.telegram.org/apps\n');

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => question('📱 Enter your phone number (with country code, e.g. +79001234567): '),
    password: async () => question('🔐 Enter your 2FA password (leave empty if none): '),
    phoneCode: async () => question('📬 Enter the code from Telegram: '),
    onError: (err) => console.error('Error:', err),
  });

  const session = client.session.save() as unknown as string;
  console.log('\n✅ Authentication successful!');
  console.log('\nAdd this to your .env file:');
  console.log(`TG_SESSION=${session}`);

  await client.disconnect();
  rl.close();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
