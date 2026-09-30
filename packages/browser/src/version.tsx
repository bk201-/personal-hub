import { CloseOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { useCallback, useEffect, useState } from 'react';

export interface VersionCheckOptions {
  clientBuildId: string;
  intervalMs?: number;
  isDev?: boolean;
  fetcher?: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
  reloadPage?: () => void;
}

const fetchVersion: NonNullable<VersionCheckOptions['fetcher']> = (...args) => globalThis.fetch(...args);
const reloadPage = () => window.location.reload();

export function useVersionCheck({
  clientBuildId,
  intervalMs = 5 * 60_000,
  isDev = false,
  fetcher = fetchVersion,
  reloadPage: reload = reloadPage,
}: VersionCheckOptions) {
  const [serverBuildId, setServerBuildId] = useState<string | null>(null);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);

  useEffect(() => {
    setServerBuildId(null);
    setDismissedBuildId(null);
    if (isDev) return;
    let active = true;
    let pending = false;
    const checkVersion = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetcher('/api/version', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!active || !data || typeof data !== 'object' || !('buildId' in data)) return;
        if (typeof data.buildId !== 'string' || !data.buildId.trim()) return;
        setServerBuildId(data.buildId);
        if (data.buildId === clientBuildId) setDismissedBuildId(null);
      } catch {
        // Polling is best effort; loss of connectivity must never reload the page.
      } finally {
        pending = false;
      }
    };
    void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientBuildId, intervalMs, isDev, fetcher]);

  const dismiss = useCallback(() => setDismissedBuildId(serverBuildId), [serverBuildId]);
  return {
    newVersionAvailable:
      !isDev && serverBuildId !== null && serverBuildId !== clientBuildId && serverBuildId !== dismissedBuildId,
    dismiss,
    reload,
  };
}

const useStyles = createStyles(({ css, token }) => ({
  banner: css`
    position: sticky;
    top: 0;
    z-index: 20;
    background: ${token.colorInfoBg};
    border-bottom: 1px solid ${token.colorInfoBorder};
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  `,
  text: css`
    color: ${token.colorInfoText};
    flex: 1;
    min-width: 0;
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  `,
}));

export function VersionBanner({
  newVersionAvailable,
  dismiss,
  reload,
  message,
  reloadLabel,
  dismissLabel,
}: ReturnType<typeof useVersionCheck> & {
  message: string;
  reloadLabel: string;
  dismissLabel: string;
}) {
  const { styles } = useStyles();
  if (!newVersionAvailable) return null;
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Typography.Text className={styles.text}>{message}</Typography.Text>
      <div className={styles.actions}>
        <Button type="primary" size="small" onClick={reload}>
          {reloadLabel}
        </Button>
        <Button type="text" size="small" icon={<CloseOutlined />} aria-label={dismissLabel} onClick={dismiss} />
      </div>
    </div>
  );
}
