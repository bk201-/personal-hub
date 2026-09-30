/**
 * Zod schemas for all API request bodies.
 *
 * Shared between server (validation) and client (type inference).
 * Server-only helpers (parseOptionalBody) remain in src/server/routes/schemas.ts.
 */

import { z } from 'zod';

// ─── Channels ─────────────────────────────────────────────────────────────────

export const createChannelSchema = z.object({
  telegramId: z.string().min(1, 'telegramId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().nullable().optional(),
  channelType: z.enum(['news', 'news_link', 'media', 'blog']).optional(),
  groupId: z.number().nullable().optional(),
  filterForwards: z.number().int().min(0).max(1).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  channelType: z.enum(['news', 'news_link', 'media', 'blog']).optional(),
  groupId: z.number().nullable().optional(),
  filterForwards: z.number().int().min(0).max(1).optional(),
  lastFetchedAt: z.number().optional(),
});

export const reorderItemsSchema = z.object({
  items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
});

export const fetchChannelSchema = z.object({
  since: z.string().optional(),
  limit: z.number().optional(),
});

// ─── News ─────────────────────────────────────────────────────────────────────

export const readAllNewsSchema = z.object({
  channelId: z.number().optional(),
  newsIds: z.array(z.number()).optional(),
  /**
   * Target read state: 1 = mark as read (default, backwards-compatible),
   * 0 = mark as unread (used by the toolbar's undo-toggle).
   */
  isRead: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const markReadSchema = z.object({
  isRead: z.number().optional(),
});

/**
 * Batch mark-read payload sent by the client-side debounced batcher.
 * `readIds`   → flip to read (unread→read), synced to Telegram.
 * `unreadIds` → flip to unread (read→unread), local-only.
 * Both are optional; either or both may be present in one request.
 */
export const readBatchNewsSchema = z.object({
  readIds: z.array(z.number()).optional(),
  unreadIds: z.array(z.number()).optional(),
});

// ─── Groups ───────────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: z.string().min(1, 'name is required'),
  color: z.string().optional(),
  pin: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  pin: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

export const verifyPinSchema = z.object({
  pin: z.string(),
});

// ─── Filters ──────────────────────────────────────────────────────────────────

export const createFilterSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.enum(['tag', 'keyword']),
  value: z.string().min(1, 'value is required'),
});

export const updateFilterSchema = z.object({
  name: z.string().optional(),
  type: z.enum(['tag', 'keyword']).optional(),
  value: z.string().optional(),
  isActive: z.number().optional(),
});

/** Batch-apply filter changes in a single request (used by the Tag Browser). */
export const batchFiltersSchema = z.object({
  toAdd: z.array(createFilterSchema).default([]),
  toDelete: z.array(z.number().int().positive()).default([]),
});

// ─── Downloads ────────────────────────────────────────────────────────────────

export const createDownloadSchema = z.object({
  newsId: z.number({ error: 'newsId is required' }),
  type: z.enum(['media', 'article', 'image'], { error: 'type is required' }),
  url: z.string().optional(),
  priority: z.number().optional(),
});

// ─── Digest ───────────────────────────────────────────────────────────────────

export const createDigestSchema = z.object({
  channelIds: z.array(z.number()).optional(),
  groupId: z.number().nullable().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  /** When provided, generate digest only for these specific news IDs (e.g. tag-filtered view) */
  newsIds: z.array(z.number()).optional(),
});

// ─── Client Log ───────────────────────────────────────────────────────────────

export const clientLogSchema = z.object({
  entries: z.array(
    z
      .object({
        level: z.enum(['warn', 'error']),
        module: z.unknown().optional(),
        msg: z.string().optional(),
        time: z.number().optional(),
        url: z.string().optional(),
      })
      .loose(),
  ),
});

// ─── TTS (Read Aloud — AI mode) ───────────────────────────────────────────────

export const createTtsSchema = z.object({
  text: z.string().min(1, 'text is required'),
  voice: z.string().optional(),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const totpConfirmSchema = z.object({
  secret: z.string().min(1),
  code: z.string().min(1),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type FetchChannelInput = z.infer<typeof fetchChannelSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateFilterInput = z.infer<typeof createFilterSchema>;
export type UpdateFilterInput = z.infer<typeof updateFilterSchema>;
export type BatchFiltersInput = z.infer<typeof batchFiltersSchema>;
export type CreateDownloadInput = z.infer<typeof createDownloadSchema>;
export type CreateDigestInput = z.infer<typeof createDigestSchema>;
