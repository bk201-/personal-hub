import { CheckOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Progress, Spin, Tag, Tooltip } from 'antd';
import { createStyles } from 'antd-style';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchDigestProgress, BatchDigestStatus } from './useBatchDigest';

const ICON_CHECK = <CheckOutlined />;
const ICON_RELOAD = <ReloadOutlined />;
const ICON_CLOCK = <ClockCircleOutlined />;
const SPIN_SMALL = <Spin size="small" />;

const useStyles = createStyles(({ css, token }) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgContainer};
  `,
  left: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  label: css`
    font-weight: 500;
    font-size: 13px;
    color: ${token.colorText};
  `,
  statusLine: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  progress: css`
    flex: 1;
    min-width: 80px;
    max-width: 200px;
  `,
  actions: css`
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  `,
  errorText: css`
    color: ${token.colorError};
    font-size: 12px;
  `,
}));

export interface DigestBatchPanelProps {
  index: number;
  fromItem: number; // 1-based item number of the first item in this batch
  toItem: number; // 1-based item number of the last item in this batch
  status: BatchDigestStatus;
  progress: BatchDigestProgress | null;
  error: string | null;
  /** True once the user has opened this batch's digest — enables "Mark as Read". */
  digestOpened: boolean;
  onShow: () => void;
  onMarkRead: () => void;
  onRetry: () => void;
}

/**
 * Single row in the Digest Progress Drawer. Shows per-batch status and action buttons.
 * Layout: [label + status/progress] [actions]
 */
export const DigestBatchPanel = memo(function DigestBatchPanel({
  fromItem,
  toItem,
  status,
  progress,
  error,
  digestOpened,
  onShow,
  onMarkRead,
  onRetry,
}: DigestBatchPanelProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  return (
    <div className={styles.row}>
      <div className={styles.left}>
        <span className={styles.label}>{t('digest.batch_label', { from: fromItem, to: toItem })}</span>
        <StatusLine status={status} progress={progress} error={error} />
      </div>
      <div className={styles.actions}>
        {status === 'done' && (
          <>
            <Button type="primary" size="small" onClick={onShow}>
              {t('digest.batch_show')}
            </Button>
            <Tooltip title={digestOpened ? '' : t('digest.batch_mark_read_disabled')}>
              <Button size="small" disabled={!digestOpened} onClick={onMarkRead} icon={ICON_CHECK}>
                {t('digest.batch_mark_read')}
              </Button>
            </Tooltip>
          </>
        )}
        {status === 'error' && (
          <Button size="small" icon={ICON_RELOAD} onClick={onRetry}>
            {t('digest.batch_retry')}
          </Button>
        )}
      </div>
    </div>
  );
});

const useStatusStyles = createStyles(({ css }) => ({
  wrap: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  `,
  progressBar: css`
    flex: 1;
    min-width: 80px;
    max-width: 200px;
  `,
  counter: css`
    white-space: nowrap;
  `,
}));

function StatusLine({
  status,
  progress,
  error,
}: {
  status: BatchDigestStatus;
  progress: BatchDigestProgress | null;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { styles } = useStatusStyles();

  if (status === 'idle') {
    return (
      <span className={styles.wrap}>
        <Tag icon={ICON_CLOCK} color="default">
          {t('digest.batch_status_pending')}
        </Tag>
      </span>
    );
  }

  if (status === 'prefetching') {
    const pct =
      progress && progress.total > 0 ? Math.round(((progress.done + progress.errors) / progress.total) * 100) : 0;
    return (
      <span className={styles.wrap}>
        <Tag color="processing">{t('digest.batch_status_prefetching')}</Tag>
        <Progress percent={pct} size="small" showInfo={false} className={styles.progressBar} />
        {progress && (
          <span className={styles.counter}>
            {progress.done}/{progress.total}
          </span>
        )}
      </span>
    );
  }

  if (status === 'generating') {
    return (
      <span className={styles.wrap}>
        <Tag color="processing" icon={SPIN_SMALL}>
          {t('digest.batch_status_generating')}
        </Tag>
      </span>
    );
  }

  if (status === 'done') {
    return (
      <span className={styles.wrap}>
        <Tag color="success" icon={ICON_CHECK}>
          {t('digest.batch_status_done')}
        </Tag>
      </span>
    );
  }

  // error
  return (
    <span className={styles.wrap}>
      <Tooltip title={error ?? ''}>
        <Tag color="error">{t('digest.batch_status_error')}</Tag>
      </Tooltip>
    </span>
  );
}
