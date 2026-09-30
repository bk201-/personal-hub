import { ThunderboltOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { createStyles } from 'antd-style';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRateLimitStore } from '../../store/rateLimitStore';

const ICON_THUNDERBOLT = <ThunderboltOutlined />;

const useStyles = createStyles(({ css }) => ({
  banner: css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  `,
}));

function useCountdown(until: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (until === null) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const ms = until - Date.now();
      setRemaining(ms > 0 ? ms : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  return remaining;
}

export function RateLimitBanner() {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const { until, clear } = useRateLimitStore();
  const remaining = useCountdown(until);

  // Auto-clear when countdown reaches zero
  useEffect(() => {
    if (until !== null && remaining === 0) {
      clear();
    }
  }, [remaining, until, clear]);

  if (!until || remaining <= 0) return null;

  const secs = Math.ceil(remaining / 1000);

  return (
    <Alert
      className={styles.banner}
      type="warning"
      icon={ICON_THUNDERBOLT}
      showIcon
      banner
      title={t('rateLimit.message', { secs })}
      description={t('rateLimit.description')}
    />
  );
}
