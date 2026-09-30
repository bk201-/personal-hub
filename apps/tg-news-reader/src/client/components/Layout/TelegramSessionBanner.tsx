import { Alert } from 'antd';
import { createStyles } from 'antd-style';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStatus } from '../../api/health';

const useStyles = createStyles(({ css }) => ({
  banner: css`
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  `,
}));

/**
 * Shows a sticky warning banner when the Telegram session has expired
 * (AUTH_KEY_UNREGISTERED). Polls /api/health every 60s.
 */
export function TelegramSessionBanner() {
  const { data } = useHealthStatus();
  const { t } = useTranslation();
  const { styles } = useStyles();

  if (!data?.telegram.sessionExpired) return null;

  return <Alert type="error" banner showIcon title={t('header.session_expired_banner')} className={styles.banner} />;
}
