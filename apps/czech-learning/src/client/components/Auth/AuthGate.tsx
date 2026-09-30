import { Spin } from 'antd';
import { createStyles } from 'antd-style';
import React, { useEffect } from 'react';
import { logger } from '../../logger';
import { useAuthStore } from '../../store/authStore';
import type { AuthUser } from '../../store/authStore';
import { LoginPage } from './LoginPage';

const useStyles = createStyles(({ css }) => ({
  loading: css`
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
}));

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const { styles } = useStyles();
  const { isCheckingAuth, accessToken, setAuth, clearAuth } = useAuthStore();

  // On mount: try to restore session via httpOnly cookie
  useEffect(() => {
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          logger.info({ module: 'auth' }, 'no active session — showing login');
          clearAuth();
          return;
        }
        const data = (await res.json()) as { accessToken: string; user: AuthUser };
        logger.info({ module: 'auth' }, 'session restored');
        setAuth(data.accessToken, data.user);
      })
      .catch((err: unknown) => {
        logger.warn({ module: 'auth', err }, 'session restore failed');
        clearAuth();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isCheckingAuth) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (!accessToken) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
