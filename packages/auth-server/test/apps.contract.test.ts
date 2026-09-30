import { Hono } from 'hono';
import { decode, sign } from 'hono/jwt';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestUser } from '../../../apps/tg-news-reader/src/server/__tests__/auth.js';
import { createTestDb, type TestDb } from '../../../apps/tg-news-reader/src/server/__tests__/testDb.js';
import type { AuthEnv } from '../src/index.js';

vi.mock('../../../apps/tg-news-reader/src/server/config.js', () => ({
  JWT_SECRET: 'news-contract-secret',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));
vi.mock('../../../apps/czech-learning/src/server/config.js', () => ({
  JWT_SECRET: 'czech-contract-secret',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));
vi.mock('../../../apps/tg-news-reader/src/server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../../apps/czech-learning/src/server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
let newsDb: TestDb;
let czechDb: TestDb;
vi.mock('../../../apps/tg-news-reader/src/server/db/index.js', () => ({
  get db() {
    return newsDb.db;
  },
}));
vi.mock('../../../apps/czech-learning/src/server/db/index.js', () => ({
  get db() {
    return czechDb.db;
  },
}));

import { authMiddleware as czechMiddleware } from '../../../apps/czech-learning/src/server/middleware/auth.js';
import { authCookies as czechCookies } from '../../../apps/czech-learning/src/server/middleware/authCookies.js';
import czechRouter, { issueAccessToken as czechToken } from '../../../apps/czech-learning/src/server/routes/auth.js';
import { authMiddleware as newsMiddleware } from '../../../apps/tg-news-reader/src/server/middleware/auth.js';
import { authCookies as newsCookies } from '../../../apps/tg-news-reader/src/server/middleware/authCookies.js';
import newsRouter, { issueAccessToken as newsToken } from '../../../apps/tg-news-reader/src/server/routes/auth.js';

const news = new Hono<AuthEnv>();
news.route('/api/auth', newsRouter);
news.use('/api/media/*', newsMiddleware);
news.all('/api/media/probe', (c) => c.json({ userId: c.get('userId') }));
news.use('/probe', newsMiddleware);
news.get('/probe', (c) => c.json({ userId: c.get('userId') }));
const czech = new Hono<AuthEnv>();
czech.route('/api/auth', czechRouter);
czech.use('/probe', czechMiddleware);
czech.get('/probe', (c) => c.json({ userId: c.get('userId') }));

function post(app: Hono<AuthEnv>, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookie(res: Response, name: string) {
  const value = res.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value.split(';')[0];
}
function sessionId(value: string) {
  return decodeURIComponent(value.slice(value.indexOf('=') + 1)).split(':')[0];
}
const credentials = { email: 'same@example.com', password: 'correct-password' };
const totpSecret = 'JBSWY3DPEHPK3PXP';
const totpCode = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totpSecret) }).generate();

beforeAll(async () => {
  newsDb = await createTestDb();
  czechDb = await createTestDb();
});
beforeEach(async () => {
  for (const db of [newsDb, czechDb]) {
    await db.client.execute('DELETE FROM sessions');
    await db.client.execute('DELETE FROM users');
  }
});
afterAll(() => {
  newsDb.client.close();
  czechDb.client.close();
});

for (const kind of ['news', 'czech'] as const) {
  const app = kind === 'news' ? news : czech;
  const cookies = kind === 'news' ? newsCookies : czechCookies;
  const db = () => (kind === 'news' ? newsDb : czechDb);
  const issueToken = kind === 'news' ? newsToken : czechToken;
  const issuer = kind === 'news' ? 'TG News Reader' : 'Czech Learning';
  describe(`${kind} real adapter auth contract`, () => {
    it('normalizes login, stores only the refresh hash, and preserves response and claim shapes', async () => {
      const user = await createTestUser(db().db, credentials);
      const res = await post(
        app,
        'login',
        { ...credentials, email: ' SAME@EXAMPLE.COM ' },
        {
          'user-agent': 'contract-client',
          'x-forwarded-for': '192.0.2.1, 192.0.2.2',
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toEqual({
        ...user,
        ...(kind === 'czech' ? { hasTOTP: false } : {}),
      });
      const payload = decode(body.accessToken).payload;
      expect(payload).toMatchObject({ sub: String(user.id), role: user.role });
      expect(payload.unlockedGroupIds).toEqual(kind === 'news' ? [] : undefined);
      const refreshCookie = cookie(res, cookies.refresh);
      const row = (await db().client.execute('SELECT * FROM sessions')).rows[0];
      expect(row.id).toBe(sessionId(refreshCookie));
      expect(row.user_agent).toBe('contract-client');
      expect(row.ip).toBe('192.0.2.1');
      expect(row.refresh_token_hash).not.toBe(decodeURIComponent(refreshCookie).split(':')[1]);
      expect(row.refresh_token_hash).toMatch(/^\$2[aby]\$/);
      expect(row.unlocked_group_ids).toBe('[]');
      expect(res.headers.get('set-cookie')).toContain('HttpOnly');
      expect(res.headers.get('set-cookie')).toContain('SameSite=Strict');
      expect(res.headers.get('set-cookie')).toContain('Path=/');
      expect(res.headers.get('set-cookie')).not.toMatch(/(?:^|, )refresh_token=/);
    });

    it('rejects unknown users and wrong passwords with the original message', async () => {
      const error = kind === 'news' ? 'Invalid credentials' : 'Invalid email or password';
      expect(await (await post(app, 'login', credentials)).json()).toEqual({ error });
      await createTestUser(db().db, credentials);
      const res = await post(app, 'login', { ...credentials, password: 'wrong' });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error });
      expect((await db().client.execute('SELECT * FROM sessions')).rows).toHaveLength(0);
    });

    it('requires TOTP, rejects invalid codes, and accepts a whitespace-separated valid code', async () => {
      await createTestUser(db().db, { ...credentials, totpSecret });
      const missing = await post(app, 'login', credentials);
      expect(missing.status).toBe(401);
      expect(await missing.json()).toEqual({ error: 'TOTP code required', requiresTOTP: true });
      const invalid = await post(app, 'login', { ...credentials, totpCode: 'invalid' });
      expect(invalid.status).toBe(401);
      expect(await invalid.json()).toEqual({ error: 'Invalid TOTP code' });
      const res = await post(app, 'login', { ...credentials, totpCode: totpCode().split('').join(' ') });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.hasTOTP).toBe(kind === 'czech' ? true : undefined);
    });

    it('preserves refresh rotation policy and unlockedGroupIds compatibility', async () => {
      await createTestUser(db().db, credentials);
      const login = await post(app, 'login', credentials);
      const original = cookie(login, cookies.refresh);
      await db().client.execute({
        sql: 'UPDATE sessions SET unlocked_group_ids = ? WHERE id = ?',
        args: ['[3,7]', sessionId(original)],
      });
      const before = (await db().client.execute('SELECT * FROM sessions')).rows[0];
      const res = await post(app, 'refresh', undefined, { Cookie: original });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(decode(body.accessToken).payload.unlockedGroupIds).toEqual(kind === 'news' ? [3, 7] : undefined);
      const after = (await db().client.execute('SELECT * FROM sessions')).rows[0];
      expect(after.unlocked_group_ids).toBe('[3,7]');
      if (kind === 'news') {
        const rotated = cookie(res, cookies.refresh);
        expect(rotated).not.toBe(original);
        expect(sessionId(rotated)).toBe(sessionId(original));
        expect(after.refresh_token_hash).not.toBe(before.refresh_token_hash);
        expect((await post(app, 'refresh', undefined, { Cookie: original })).status).toBe(401);
        expect((await post(app, 'refresh', undefined, { Cookie: rotated })).status).toBe(200);
      } else {
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(after.refresh_token_hash).toBe(before.refresh_token_hash);
        expect(after.expires_at).toBe(before.expires_at);
        expect((await post(app, 'refresh', undefined, { Cookie: original })).status).toBe(200);
      }
    });

    it('rejects missing, unknown, malformed, wrong, and expired refresh tokens', async () => {
      expect((await post(app, 'refresh')).status).toBe(401);
      for (const value of ['missing:token', 'no-colon', ':token', 'id:']) {
        expect((await post(app, 'refresh', undefined, { Cookie: `${cookies.refresh}=${value}` })).status).toBe(401);
      }
      await createTestUser(db().db, credentials);
      const login = await post(app, 'login', credentials);
      const original = cookie(login, cookies.refresh);
      const wrong = await post(app, 'refresh', undefined, {
        Cookie: `${cookies.refresh}=${sessionId(original)}:wrong`,
      });
      expect(await wrong.json()).toEqual({ error: 'Invalid refresh token' });
      await db().client.execute('UPDATE sessions SET expires_at = 1');
      const expired = await post(app, 'refresh', undefined, { Cookie: original });
      expect(expired.status).toBe(401);
      expect(await expired.json()).toEqual({ error: 'Session expired' });
      expect(expired.headers.get('set-cookie')).toContain(`${cookies.refresh}=`);
      expect((await db().client.execute('SELECT * FROM sessions')).rows).toHaveLength(0);
    });

    it('deletes only its session on logout and is idempotent without cookies', async () => {
      await createTestUser(db().db, credentials);
      const original = cookie(await post(app, 'login', credentials), cookies.refresh);
      const other = cookie(await post(app, 'login', credentials), cookies.refresh);
      const res = await post(app, 'logout', undefined, { Cookie: original });
      expect(await res.json()).toEqual({ success: true });
      expect(res.headers.get('set-cookie')).toContain(`${cookies.refresh}=`);
      expect((await post(app, 'refresh', undefined, { Cookie: original })).status).toBe(401);
      expect((await post(app, 'refresh', undefined, { Cookie: other })).status).toBe(200);
      expect((await post(app, 'logout')).status).toBe(200);
    });

    it('protects me and every TOTP method, supports setup/confirm/disable, and scopes issuer', async () => {
      for (const [path, method] of [
        ['me', 'GET'],
        ['totp/setup', 'GET'],
        ['totp/confirm', 'POST'],
        ['totp', 'DELETE'],
      ]) {
        expect((await app.request(`/api/auth/${path}`, { method })).status).toBe(401);
      }
      const user = await createTestUser(db().db, credentials);
      const headers = { Authorization: `Bearer ${await issueToken(user.id, user.role, 'session')}` };
      const setup = await app.request('/api/auth/totp/setup', { headers });
      const { qrCode, otpauthUrl, secret } = await setup.json();
      expect(qrCode).toContain('data:image/png');
      expect(new URL(otpauthUrl).searchParams.get('issuer')).toBe(issuer);
      expect(secret).toBeTruthy();
      const invalid = await post(app, 'totp/confirm', { secret: totpSecret, code: 'invalid' }, headers);
      expect(invalid.status).toBe(400);
      const valid = await post(app, 'totp/confirm', { secret: totpSecret, code: totpCode() }, headers);
      expect(valid.status).toBe(200);
      expect(await (await app.request('/api/auth/me', { headers })).json()).toMatchObject({ hasTOTP: true });
      expect((await app.request('/api/auth/totp', { method: 'DELETE', headers })).status).toBe(200);
      expect(await (await app.request('/api/auth/me', { headers })).json()).toMatchObject({ hasTOTP: false });
    });

    it('preserves bearer/query precedence and rejects expired and foreign signatures', async () => {
      const ownToken = await issueToken(1, 'admin', 'session');
      expect((await app.request(`/probe?token=${ownToken}`)).status).toBe(200);
      const res = await app.request(`/probe?token=${ownToken}`, { headers: { Authorization: 'Bearer invalid' } });
      expect(res.status).toBe(401);
      const expired = await sign(
        { sub: '1', role: 'admin', sessionId: 's', exp: 1 },
        kind === 'news' ? 'news-contract-secret' : 'czech-contract-secret',
        'HS256',
      );
      expect((await app.request('/probe', { headers: { Authorization: `Bearer ${expired}` } })).status).toBe(401);
    });
  });
}

describe('cross-app isolation and app-owned extensions', () => {
  it('rejects the other JWT, refresh cookie, renamed refresh cookie, and cross-app logout', async () => {
    await createTestUser(newsDb.db, credentials);
    await createTestUser(czechDb.db, credentials);
    const newsLogin = await post(news, 'login', credentials);
    const czechLogin = await post(czech, 'login', credentials);
    const newsRefresh = cookie(newsLogin, newsCookies.refresh);
    const czechRefresh = cookie(czechLogin, czechCookies.refresh);
    const newsBody = await newsLogin.json();
    const czechBody = await czechLogin.json();
    expect(newsCookies.refresh).not.toBe(czechCookies.refresh);
    for (const [app, foreignToken, foreignCookie, ownName, ownCookie] of [
      [news, czechBody.accessToken, czechRefresh, newsCookies.refresh, newsRefresh],
      [czech, newsBody.accessToken, newsRefresh, czechCookies.refresh, czechRefresh],
    ] as const) {
      expect((await app.request('/probe', { headers: { Authorization: `Bearer ${foreignToken}` } })).status).toBe(401);
      expect((await post(app, 'refresh', undefined, { Cookie: foreignCookie })).status).toBe(401);
      const renamed = `${ownName}=${foreignCookie.slice(foreignCookie.indexOf('=') + 1)}`;
      expect((await post(app, 'refresh', undefined, { Cookie: renamed })).status).toBe(401);
      expect((await post(app, 'logout', undefined, { Cookie: foreignCookie })).status).toBe(200);
      expect((await post(app, 'refresh', undefined, { Cookie: ownCookie })).status).toBe(200);
    }
  });

  it('does not share user credentials or TOTP state', async () => {
    await createTestUser(newsDb.db, credentials);
    await createTestUser(czechDb.db, { ...credentials, password: 'different-password', totpSecret });
    expect((await post(czech, 'login', credentials)).status).toBe(401);
    expect((await post(news, 'login', credentials)).status).toBe(200);
    const missingTotp = await post(czech, 'login', { ...credentials, password: 'different-password' });
    expect(await missingTotp.json()).toMatchObject({ requiresTOTP: true });
  });

  it('keeps media-cookie authentication GET-only, news-only, session-backed and logout-revocable', async () => {
    await createTestUser(newsDb.db, credentials);
    const login = await post(news, 'login', credentials);
    const media = cookie(login, newsCookies.media);
    const refresh = cookie(login, newsCookies.refresh);
    expect((await news.request('/api/media/probe', { headers: { Cookie: media } })).status).toBe(200);
    for (const method of ['POST', 'HEAD']) {
      expect((await news.request('/api/media/probe', { method, headers: { Cookie: media } })).status).toBe(401);
    }
    expect((await news.request('/probe', { headers: { Cookie: media } })).status).toBe(401);
    expect((await czech.request('/probe', { headers: { Cookie: media } })).status).toBe(401);
    const rotated = await post(news, 'refresh', undefined, { Cookie: refresh });
    expect(cookie(rotated, newsCookies.media)).toBeTruthy();
    expect(rotated.headers.get('set-cookie')).toContain('Path=/api/media');
    const logout = await post(news, 'logout', undefined, { Cookie: cookie(rotated, newsCookies.refresh) });
    expect(logout.headers.get('set-cookie')).toContain(`${newsCookies.media}=`);
    expect((await news.request('/api/media/probe', { headers: { Cookie: media } })).status).toBe(401);
  });

  it('preserves news validation and keeps session-management routes news-owned', async () => {
    expect((await post(news, 'login', { email: '', password: '' })).status).toBe(400);
    await createTestUser(czechDb.db, credentials);
    const { accessToken } = await (await post(czech, 'login', credentials)).json();
    expect(
      (await czech.request('/api/auth/sessions', { headers: { Authorization: `Bearer ${accessToken}` } })).status,
    ).toBe(404);
  });

  it('rejects expired, mismatched, and overridden media cookies', async () => {
    await createTestUser(newsDb.db, credentials);
    const login = await post(news, 'login', credentials);
    const media = cookie(login, newsCookies.media);
    const id = sessionId(cookie(login, newsCookies.refresh));
    const overridden = await news.request('/api/media/probe', {
      headers: { Cookie: media, Authorization: 'Bearer invalid' },
    });
    expect(overridden.status).toBe(401);
    const mismatched = await sign(
      { sub: '-1', role: 'admin', sessionId: id, exp: Math.floor(Date.now() / 1000) + 60 },
      'news-contract-secret',
      'HS256',
    );
    expect(
      (
        await news.request('/api/media/probe', {
          headers: { Cookie: `${newsCookies.media}=${mismatched}` },
        })
      ).status,
    ).toBe(401);
    await newsDb.client.execute('UPDATE sessions SET expires_at = 1');
    expect((await news.request('/api/media/probe', { headers: { Cookie: media } })).status).toBe(401);
  });
});
