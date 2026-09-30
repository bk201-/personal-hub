import type { Hono } from 'hono';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import type { AuthEnv, AuthOptions, AuthSession } from './types.js';

export function registerTotpRoutes<Session extends AuthSession>(router: Hono<AuthEnv>, options: AuthOptions<Session>) {
  router.use('/totp/*', options.middleware);
  router.get('/totp/setup', async (c) => {
    const user = await options.store.findUserById(c.get('userId'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: options.totpIssuer,
      label: user.email,
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const otpauthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return c.json({ qrCode, secret: secret.base32, otpauthUrl });
  });
  if (options.validation) router.post('/totp/confirm', options.validation.totpConfirm);
  router.post('/totp/confirm', async (c) => {
    const body = await c.req.json<{ secret: string; code: string }>();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(body.secret) });
    if (totp.validate({ token: body.code.replace(/\s/g, ''), window: 1 }) === null) {
      return c.json({ error: 'Invalid code. Make sure the time is correct.' }, 400);
    }
    await options.store.setTotpSecret(c.get('userId'), body.secret);
    return c.json({ success: true });
  });
  router.delete('/totp', async (c) => {
    await options.store.setTotpSecret(c.get('userId'), null);
    return c.json({ success: true });
  });
}
