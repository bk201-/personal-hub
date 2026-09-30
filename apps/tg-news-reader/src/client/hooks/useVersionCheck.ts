import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION } from '../appVersion';

const DEFAULT_INTERVAL_MS = 5 * 60_000;

interface VersionPayload {
  version?: unknown;
}

type VersionResponse = Pick<Response, 'ok' | 'json'>;
type VersionFetch = (input: string, init?: RequestInit) => Promise<VersionResponse>;

interface UseVersionCheckOptions {
  clientVersion?: string;
  intervalMs?: number;
  isDev?: boolean;
  fetcher?: VersionFetch;
}

export function useVersionCheck({
  clientVersion = APP_VERSION,
  intervalMs = DEFAULT_INTERVAL_MS,
  isDev = import.meta.env.DEV,
  fetcher = fetch,
}: UseVersionCheckOptions = {}) {
  const [hasMismatch, setHasMismatch] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isDev) return;

    let active = true;

    const checkVersion = async () => {
      // Don't poll while the page is hidden — no point burning the network
      // (and waking a sleeping server) for a page nobody is looking at.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const response = await fetcher('/api/version', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const data = (await response.json()) as VersionPayload;
        if (!active || typeof data.version !== 'string') return;

        const mismatch = data.version !== clientVersion;
        // Only reset `dismissed` when a NEW mismatch is first detected
        // (i.e., server just deployed a new version). Don't reset if the
        // user already dismissed this banner — it would re-appear every 5 min.
        setHasMismatch((prev) => {
          if (!prev && mismatch) setDismissed(false);
          return mismatch;
        });
      } catch {
        // Ignore transient failures — version polling is best-effort only.
      }
    };

    void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), intervalMs);

    // Catch up immediately when the user returns to the tab.
    const handleVisibility = () => {
      if (!document.hidden) void checkVersion();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      active = false;
      window.clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [clientVersion, fetcher, intervalMs, isDev]);

  const dismiss = useCallback(() => setDismissed(true), []);
  const reload = useCallback(() => window.location.reload(), []);

  return {
    newVersionAvailable: hasMismatch && !dismissed,
    dismiss,
    reload,
  };
}
