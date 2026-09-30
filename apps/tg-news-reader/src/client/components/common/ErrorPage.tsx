import { Button } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';

interface ErrorPageProps {
  /** Override the default description with a specific JS error message. */
  message?: string;
  onRetry?: () => void;
}

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: ${token.colorBgLayout};
    padding: 40px 24px;
    text-align: center;
    gap: 4px;
  `,
  emoji: css`
    font-size: 80px;
    line-height: 1;
    margin-bottom: 8px;
    animation: errFloat 3.5s ease-in-out infinite;
    @keyframes errFloat {
      0%,
      100% {
        transform: translateY(0) rotate(0deg);
      }
      40% {
        transform: translateY(-14px) rotate(-4deg);
      }
      60% {
        transform: translateY(-10px) rotate(3deg);
      }
    }
  `,
  oops: css`
    font-size: 52px;
    font-weight: 900;
    color: ${token.colorText};
    line-height: 1;
    margin: 8px 0 0;
    letter-spacing: -1px;
  `,
  subtitle: css`
    font-size: 20px;
    font-weight: 600;
    color: ${token.colorTextSecondary};
    margin: 12px 0 0;
  `,
  description: css`
    font-size: 14px;
    color: ${token.colorTextTertiary};
    max-width: 420px;
    line-height: 1.65;
    margin: 6px 0 0;
  `,
  actions: css`
    display: flex;
    gap: 12px;
    margin-top: 28px;
  `,
}));

export function ErrorPage({ message, onRetry }: ErrorPageProps) {
  const { styles } = useStyles();
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <span className={styles.emoji}>🤯</span>
      <p className={styles.oops}>Oops!</p>
      <p className={styles.subtitle}>{t('error.crash_title')}</p>
      <p className={styles.description}>{message || t('error.crash_description')}</p>
      {onRetry && (
        <div className={styles.actions}>
          <Button type="primary" size="large" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
