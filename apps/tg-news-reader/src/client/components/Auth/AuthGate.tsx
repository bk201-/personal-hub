import { WifiOutlined } from '@ant-design/icons';
import { Button, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tryRefresh } from '../../api/client';
import { logger } from '../../logger';
import { useAuthStore } from '../../store/authStore';
import { LoginPage } from './LoginPage';

const useStyles = createStyles(({ css, token }) => ({
  loading: css`
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  offline: css`
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${token.marginMD}px;
    color: ${token.colorTextSecondary};
  `,
  wifiIcon: css`
    font-size: 48px;
  `,
}));

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const { isCheckingAuth, accessToken, setCheckingAuth } = useAuthStore();
  const [networkError, setNetworkError] = useState(false);

  // isRetry=true: called from the "Retry" button — need to show spinner first.
  // isRetry=false: called on mount — isCheckingAuth is already true from store initial state.
  const restoreSession = React.useCallback(
    (isRetry = false) => {
      setNetworkError(false);
      if (isRetry) setCheckingAuth(true);
      // tryRefresh calls setAuth/clearAuth internally; on network error it returns null without clearing auth
      void tryRefresh().then((token) => {
        if (token === null) {
          // Check if server explicitly cleared auth (clearAuth sets isCheckingAuth=false)
          // or if it was a network error (isCheckingAuth stays true because nothing changed it)
          const state = useAuthStore.getState();
          if (state.isCheckingAuth) {
            // Network error path — server never responded; don't boot user to login
            logger.warn({ module: 'auth' }, 'session restore failed — network error');
            setCheckingAuth(false);
            setNetworkError(true);
          }
          // else: server returned !ok → clearAuth() already called → isCheckingAuth=false, accessToken=null → LoginPage
        } else {
          logger.info({ module: 'auth' }, 'session restored');
        }
      });
    },
    [setCheckingAuth, setNetworkError],
  );

  // On mount: try to restore session via httpOnly cookie
  useEffect(() => {
    restoreSession(false);
  }, [restoreSession]);

  const handleRetry = React.useCallback(() => restoreSession(true), [restoreSession]);

  // Auto-retry when browser comes back online
  useEffect(() => {
    if (!networkError) return;
    const handler = () => {
      logger.info({ module: 'auth' }, 'network back online — retrying session restore');
      restoreSession(true);
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [networkError, restoreSession]);

  if (isCheckingAuth) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (networkError) {
    return (
      <div className={styles.offline}>
        <WifiOutlined className={styles.wifiIcon} />
        <Typography.Text>{t('auth.noConnection')}</Typography.Text>
        <Button onClick={handleRetry}>{t('auth.retry')}</Button>
      </div>
    );
  }

  if (!accessToken) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
