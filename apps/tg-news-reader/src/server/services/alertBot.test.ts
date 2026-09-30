import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn() },
}));

describe('sendAlert', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    process.env.ALERT_BOT_TOKEN = 'test-token';
    process.env.ALERT_CHAT_ID = '12345';
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('sends a message via Telegram Bot API', async () => {
    const { sendAlert } = await import('./alertBot.js');
    await sendAlert('test message');

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toContain('bottest-token/sendMessage');
    expect(JSON.parse(opts!.body as string)).toMatchObject({
      chat_id: '12345',
      text: expect.stringContaining('test message'),
    });
  });

  it('no-ops when env vars are absent', async () => {
    delete process.env.ALERT_BOT_TOKEN;
    delete process.env.ALERT_CHAT_ID;
    const { sendAlert } = await import('./alertBot.js');
    await sendAlert('test');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deduplicates alerts with same key within 5 min', async () => {
    const { sendAlert } = await import('./alertBot.js');
    await sendAlert('msg1', 'key1');
    await sendAlert('msg2', 'key1'); // same key — should be suppressed
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('allows same key after 5 min cooldown', async () => {
    const { sendAlert } = await import('./alertBot.js');
    await sendAlert('msg1', 'key1');
    vi.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await sendAlert('msg2', 'key1'); // 5 min passed — should fire
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('allows different dedup keys simultaneously', async () => {
    const { sendAlert } = await import('./alertBot.js');
    await sendAlert('msg1', 'key1');
    await sendAlert('msg2', 'key2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
