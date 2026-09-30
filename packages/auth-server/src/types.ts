import type { Context, MiddlewareHandler } from 'hono';

export type AuthEnv = {
  Variables: { userId: number; userRole: string; sessionId: string };
};

export interface AuthPayload {
  sub: string;
  role: string;
  sessionId: string;
  exp: number;
}

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  passwordHash: string;
  totpSecret: string | null;
}

export interface AuthSession {
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: number;
}

export interface AuthStore<Session extends AuthSession = AuthSession> {
  findUserByEmail(email: string): Promise<AuthUser | undefined>;
  findUserById(id: number): Promise<AuthUser | undefined>;
  setTotpSecret(userId: number, secret: string | null): Promise<void>;
  findSession(id: string): Promise<Session | undefined>;
  createSession(session: AuthSession & { userAgent: string | null; ip: string | null }): Promise<void>;
  rotateSession(id: string, update: Pick<AuthSession, 'refreshTokenHash' | 'expiresAt'>): Promise<void>;
  deleteSession(id: string): Promise<void>;
}

export interface AuthLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface AuthOptions<Session extends AuthSession> {
  store: AuthStore<Session>;
  logger: AuthLogger;
  jwt: { secret: string; accessExpiresSec: number };
  refresh: { cookieName: string; expiresDays: number; secure: boolean; rotate: boolean };
  totpIssuer: string;
  invalidCredentialsMessage: string;
  includeHasTotp?: boolean;
  middleware: MiddlewareHandler<AuthEnv>;
  validation?: {
    login: MiddlewareHandler<AuthEnv>;
    totpConfirm: MiddlewareHandler<AuthEnv>;
  };
  accessClaims?: (session?: Session) => Record<string, unknown>;
  onSessionCookie?: (c: Context<AuthEnv>, user: AuthUser, sessionId: string, expiresAt: number) => Promise<void>;
  onLogout?: (c: Context<AuthEnv>) => void;
}
