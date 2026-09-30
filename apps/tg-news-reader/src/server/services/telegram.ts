/**
 * Telegram — barrel re-export module.
 *
 * Split into:
 *   telegramClient.ts  — connection lifecycle (mutex, delay, disconnect)
 *   telegramParser.ts  — message parsing (fields, links, hashtags, Instant View)
 *   telegramApi.ts     — public API (fetch, getInfo, read, download)
 *
 * This file re-exports everything so existing `from './telegram.js'` imports
 * continue to work. New code should import from the specific module directly.
 */

export {
  getTelegramClient,
  isTelegramDelayed,
  disconnectTelegramClient,
  resetTelegramClient,
} from './telegramClient.js';
export type { TelegramMessage } from './telegramParser.js';
export {
  fetchChannelMessages,
  getChannelInfo,
  getReadInboxMaxId,
  readChannelHistory,
  downloadMessageMedia,
  fetchMessageById,
  resolveInstantViewImages,
} from './telegramApi.js';
export type { ChannelInfo } from './telegramApi.js';
