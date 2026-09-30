/**
 * Re-exports all Zod schemas from the shared module and provides
 * the server-only parseOptionalBody helper (depends on Hono Context).
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

// Re-export every schema so existing server route imports stay unchanged
export {
  createChannelSchema,
  updateChannelSchema,
  reorderItemsSchema,
  fetchChannelSchema,
  readAllNewsSchema,
  markReadSchema,
  readBatchNewsSchema,
  createGroupSchema,
  updateGroupSchema,
  verifyPinSchema,
  createFilterSchema,
  updateFilterSchema,
  batchFiltersSchema,
  createDownloadSchema,
  createDigestSchema,
  createTtsSchema,
  clientLogSchema,
  loginSchema,
  totpConfirmSchema,
} from '../../shared/schemas.js';

/**
 * Safely parse a JSON body and validate with Zod.
 * Returns the default value if the body is empty or malformed JSON.
 * Throws HTTPException(400) if the body is present but fails schema validation.
 */
export async function parseOptionalBody<T>(c: Context, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => null);
  if (raw === null || raw === undefined) return fallback;
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new HTTPException(400, { message: 'Invalid request body', cause: err });
    }
    throw err;
  }
}
