/**
 * Sends Telegram push alerts to ALERT_CHAT_ID via ALERT_BOT_TOKEN.
 * No-op when either env var is absent — safe to call unconditionally.
 *
 * Env vars:
 *   ALERT_BOT_TOKEN  — BotFather token  (e.g. 123456:ABCdef...)
 *   ALERT_CHAT_ID    — numeric chat ID where bot sends messages
 *
 * Create a bot: https://t.me/BotFather  → /newbot
 * Get chat ID:  send any message to the bot, then call
 *   https://api.telegram.org/bot<TOKEN>/getUpdates
 *   and read  result[0].message.chat.id
 */
import { logger } from '../logger.js';

// Prevent alert spam — same dedupKey won't fire more than once per cooldown window
const lastAlertTime = new Map<string, number>();
const ALERT_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Send an alert message.
 * @param message  Human-readable description of the problem
 * @param dedupKey Optional key for deduplication (defaults to `message`).
 *                 Alerts with the same key are suppressed for 5 min.
 */
export async function sendAlert(message: string, dedupKey?: string): Promise<void> {
  const token = process.env.ALERT_BOT_TOKEN;
  const chatId = process.env.ALERT_CHAT_ID;
  if (!token || !chatId) return;

  const key = dedupKey ?? message;
  const last = lastAlertTime.get(key) ?? 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return; // suppress duplicate
  lastAlertTime.set(key, Date.now());

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🚨 <b>TG Reader</b>\n${message}`,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ module: 'alert', status: res.status, body }, 'alert bot failed to send');
    }
  } catch (err) {
    logger.warn({ module: 'alert', err }, 'alert bot request failed');
  }
}
