import { logger } from '../logger.js';
import { isTransientTelegramError, TELEGRAM_POLICY, withRetry } from '../utils/retry.js';
import { sendAlert } from './alertBot.js';

export { isTransientTelegramError };

// ─── Reconnect callback ───────────────────────────────────────────────────────

// Injected by telegram.ts to avoid circular imports. Called when AUTH_KEY_UNREGISTERED
// is caught and the circuit attempts an automatic reconnect.
type ReconnectFn = () => Promise<void>;
let _reconnectFn: ReconnectFn | null = null;

export function setReconnectCallback(fn: ReconnectFn): void {
  _reconnectFn = fn;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

export class TelegramCircuitBreaker {
  private _state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private _sessionExpired = false;

  constructor(
    private readonly failureThreshold: number,
    private readonly halfOpenAfterMs: number,
  ) {}

  getState(): CircuitState {
    if (this._state === 'open' && Date.now() - this.openedAt >= this.halfOpenAfterMs) {
      this._state = 'half-open';
      logger.info({ module: 'telegram' }, 'circuit breaker → half-open (probing)');
    }
    return this._state;
  }

  isSessionExpired(): boolean {
    return this._sessionExpired;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this._sessionExpired = false;
    if (this._state !== 'closed') {
      logger.info({ module: 'telegram' }, 'circuit breaker → closed');
      this._state = 'closed';
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold && this._state === 'closed') {
      this._state = 'open';
      this.openedAt = Date.now();
      logger.error(
        { module: 'telegram', consecutiveFailures: this.consecutiveFailures },
        'circuit breaker → OPEN — Telegram unreachable, blocking calls for 30s',
      );
      void sendAlert('Telegram circuit breaker OPEN — Telegram unreachable, calls blocked for 30s', 'circuit-open');
    }
  }

  private _reconnecting = false;

  private async handleAuthKeyInvalid(reason: string): Promise<void> {
    // Deduplicate: if 13 concurrent fetches all get AUTH_KEY_DUPLICATED,
    // only the first one triggers reconnect — the rest just wait.
    if (this._reconnecting) return;
    this._reconnecting = true;

    logger.warn({ module: 'telegram', reason }, `${reason} — attempting automatic reconnect`);
    if (_reconnectFn) {
      try {
        await _reconnectFn();
        logger.info({ module: 'telegram' }, 'Telegram auto-reconnect succeeded — session restored');
        this._sessionExpired = false;
        this._reconnecting = false;
        return;
      } catch (reconnectErr) {
        logger.warn({ module: 'telegram', err: reconnectErr }, 'Telegram auto-reconnect failed');
      }
    }
    this._reconnecting = false;
    // Reconnect failed (or no callback registered) — mark as expired
    if (!this._sessionExpired) {
      this._sessionExpired = true;
      void sendAlert(
        `Telegram session invalidated (${reason}) — run <code>npm run tg:auth</code> and redeploy`,
        'auth-key-invalid',
      );
    }
  }

  async execute<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const state = this.getState();
    if (state === 'open') {
      const retryInSec = Math.ceil((this.halfOpenAfterMs - (Date.now() - this.openedAt)) / 1_000);
      throw new Error(`Telegram circuit breaker OPEN — retry in ${retryInSec}s`);
    }

    try {
      const result = await withRetry(fn, TELEGRAM_POLICY, context);
      this.recordSuccess();
      return result;
    } catch (err) {
      if (isTransientTelegramError(err)) this.recordFailure();
      // Session invalidated → attempt auto-reconnect, then alert if still failing (permanent)
      if (err instanceof Error) {
        if (err.message.includes('AUTH_KEY_UNREGISTERED')) {
          await this.handleAuthKeyInvalid('AUTH_KEY_UNREGISTERED');
        } else if (err.message.includes('AUTH_KEY_DUPLICATED')) {
          await this.handleAuthKeyInvalid('AUTH_KEY_DUPLICATED');
        }
      }
      throw err;
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const telegramCircuit = new TelegramCircuitBreaker(
  5, // open after 5 consecutive transient failures
  30_000, // half-open after 30s
);

/** Expose state for GET /api/health */
export function getTelegramCircuitState(): CircuitState {
  return telegramCircuit.getState();
}

/** Expose session-expired flag for GET /api/health */
export function getTelegramSessionExpired(): boolean {
  return telegramCircuit.isSessionExpired();
}
