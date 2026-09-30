import { describe, expect, it } from 'vitest';
import {
  clientLogSchema,
  createChannelSchema,
  createDigestSchema,
  createDownloadSchema,
  createFilterSchema,
  createGroupSchema,
  fetchChannelSchema,
  loginSchema,
  totpConfirmSchema,
  updateChannelSchema,
  updateFilterSchema,
  updateGroupSchema,
  verifyPinSchema,
} from './schemas.js';

describe('createChannelSchema', () => {
  it('accepts valid input', () => {
    const result = createChannelSchema.safeParse({ telegramId: 'abc', name: 'Test' });
    expect(result.success).toBe(true);
  });

  it('rejects empty telegramId', () => {
    const result = createChannelSchema.safeParse({ telegramId: '', name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createChannelSchema.safeParse({ telegramId: 'abc', name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = createChannelSchema.safeParse({
      telegramId: 'abc',
      name: 'Test',
      channelType: 'media',
      groupId: null,
      description: 'desc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid channelType', () => {
    const result = createChannelSchema.safeParse({ telegramId: 'abc', name: 'Test', channelType: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('updateChannelSchema', () => {
  it('accepts partial updates', () => {
    expect(updateChannelSchema.safeParse({ name: 'New' }).success).toBe(true);
    expect(updateChannelSchema.safeParse({ channelType: 'blog' }).success).toBe(true);
    expect(updateChannelSchema.safeParse({}).success).toBe(true);
  });
});

describe('fetchChannelSchema', () => {
  it('accepts empty object', () => {
    expect(fetchChannelSchema.safeParse({}).success).toBe(true);
  });

  it('accepts since and limit', () => {
    const result = fetchChannelSchema.safeParse({ since: '2024-01-01', limit: 50 });
    expect(result.success).toBe(true);
  });
});

describe('createGroupSchema', () => {
  it('requires name', () => {
    expect(createGroupSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: 'Test' }).success).toBe(true);
  });
});

describe('updateGroupSchema', () => {
  it('accepts partial fields', () => {
    expect(updateGroupSchema.safeParse({ color: '#ff0000' }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ pin: null }).success).toBe(true);
  });
});

describe('verifyPinSchema', () => {
  it('requires pin string', () => {
    expect(verifyPinSchema.safeParse({ pin: '1234' }).success).toBe(true);
    expect(verifyPinSchema.safeParse({}).success).toBe(false);
  });
});

describe('createFilterSchema', () => {
  it('validates required fields', () => {
    expect(createFilterSchema.safeParse({ name: 'f', type: 'tag', value: '#test' }).success).toBe(true);
    expect(createFilterSchema.safeParse({ name: '', type: 'tag', value: 'v' }).success).toBe(false);
    expect(createFilterSchema.safeParse({ name: 'f', type: 'bad', value: 'v' }).success).toBe(false);
  });
});

describe('updateFilterSchema', () => {
  it('accepts partial updates', () => {
    expect(updateFilterSchema.safeParse({ isActive: 0 }).success).toBe(true);
    expect(updateFilterSchema.safeParse({}).success).toBe(true);
  });
});

describe('createDownloadSchema', () => {
  it('accepts an image download with user priority and no URL', () => {
    expect(createDownloadSchema.safeParse({ newsId: 42, type: 'image', priority: 10 })).toEqual({
      success: true,
      data: { newsId: 42, type: 'image', priority: 10 },
    });
  });

  it('requires newsId and type', () => {
    expect(createDownloadSchema.safeParse({ newsId: 1, type: 'media' }).success).toBe(true);
    expect(createDownloadSchema.safeParse({ type: 'media' }).success).toBe(false);
    expect(createDownloadSchema.safeParse({ newsId: 1, type: 'bad' }).success).toBe(false);
  });
});

describe('createDigestSchema', () => {
  it('accepts optional fields', () => {
    expect(createDigestSchema.safeParse({}).success).toBe(true);
    expect(createDigestSchema.safeParse({ channelIds: [1, 2], groupId: null }).success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('requires email and password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.c', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: '', password: 'x' }).success).toBe(false);
  });
});

describe('totpConfirmSchema', () => {
  it('requires secret and code', () => {
    expect(totpConfirmSchema.safeParse({ secret: 's', code: 'c' }).success).toBe(true);
    expect(totpConfirmSchema.safeParse({ secret: '', code: 'c' }).success).toBe(false);
  });
});

describe('clientLogSchema', () => {
  it('validates entries array', () => {
    const result = clientLogSchema.safeParse({
      entries: [{ level: 'warn', msg: 'test', time: 123 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid level', () => {
    const result = clientLogSchema.safeParse({
      entries: [{ level: 'info', msg: 'test' }],
    });
    expect(result.success).toBe(false);
  });
});
