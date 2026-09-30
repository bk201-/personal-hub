import { Button, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannelStorage } from '../../api/channelStorage';
import { formatBytes } from '../News/newsUtils';

const useStyles = createStyles(({ css }) => ({
  storage: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
}));

export function ChannelStorageInfo({ channelId }: { channelId: number }) {
  const { t, i18n } = useTranslation();
  const { styles } = useStyles();
  const { data, isPending, isError, refetch } = useChannelStorage(channelId, true);
  const retry = useCallback(() => void refetch(), [refetch]);
  return (
    <section className={styles.storage} aria-label={t('channels.info.storage')}>
      <Typography.Text strong>{t('channels.info.storage')}</Typography.Text>
      {isPending ? (
        <span role="status">{t('channels.info.storage_loading')}</span>
      ) : isError ? (
        <div role="alert">
          {t('channels.info.storage_error')}{' '}
          <Button size="small" onClick={retry}>
            {t('channels.info.retry')}
          </Button>
        </div>
      ) : data ? (
        <>
          <Typography.Text strong>{formatBytes(data.bytes)}</Typography.Text>
          <span>
            {t('channels.info.storage_bytes', {
              bytes: data.bytes.toLocaleString(i18n.language),
              count: data.fileCount,
            })}
          </span>
          <Typography.Text type="secondary">
            {t('channels.info.checked_at', { date: new Date(data.checkedAt * 1000).toLocaleString(i18n.language) })}
          </Typography.Text>
        </>
      ) : null}
    </section>
  );
}
