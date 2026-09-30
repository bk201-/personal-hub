import { DeleteOutlined, FileTextOutlined, PictureOutlined, RocketOutlined, WarningOutlined } from '@ant-design/icons';
import type { DownloadTask } from '@shared/types.ts';
import { Button, List, Space, Spin, Tag, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import type { TaskMutation } from './DownloadTaskList';

const ICON_WARNING = <WarningOutlined />;
const ICON_ROCKET = <RocketOutlined />;
const ICON_DELETE = <DeleteOutlined />;

const useStyles = createStyles(({ css }) => ({
  typeIcon: css`
    font-size: 18px;
    opacity: 0.6;
  `,
  title: css`
    font-size: 12px;
  `,
  text: css`
    font-size: 11px;
  `,
  error: css`
    font-size: 11px;
    display: block;
    margin-top: 2px;
  `,
}));

export function DownloadTaskRow({
  task,
  cancelDownload,
  prioritizeDownload,
}: {
  task: DownloadTask;
  cancelDownload: TaskMutation;
  prioritizeDownload: TaskMutation;
}) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const handleBoost = useCallback(() => prioritizeDownload.mutate(task.id), [prioritizeDownload, task.id]);
  const handleCancel = useCallback(() => cancelDownload.mutate(task.id), [cancelDownload, task.id]);
  const canAct = task.status === 'pending' || task.status === 'failed';
  const cancelling = cancelDownload.isPending && cancelDownload.variables === task.id;
  const prioritizing = prioritizeDownload.isPending && prioritizeDownload.variables === task.id;
  const busy = cancelling || prioritizing;
  const actions = [
    canAct && (task.priority < 10 || task.status === 'failed') ? (
      <Tooltip title={t('downloads.boost_tooltip')} placement="left" key="boost">
        <Button
          size="small"
          icon={ICON_ROCKET}
          aria-label={t('downloads.boost_tooltip')}
          onClick={handleBoost}
          loading={prioritizing}
          disabled={busy}
        />
      </Tooltip>
    ) : null,
    canAct ? (
      <Tooltip title={t('downloads.cancel_tooltip')} placement="left" key="cancel">
        <Button
          size="small"
          danger
          icon={ICON_DELETE}
          aria-label={t('downloads.cancel_tooltip')}
          onClick={handleCancel}
          loading={cancelling}
          disabled={busy}
        />
      </Tooltip>
    ) : null,
  ].filter(Boolean);

  const status =
    task.status === 'processing' ? (
      <Tag color="processing">{t('downloads.status_processing')}</Tag>
    ) : task.status === 'failed' ? (
      <Tag color="error" icon={ICON_WARNING}>
        {t('downloads.status_error')}
      </Tag>
    ) : task.priority >= 10 ? (
      <Tag color="warning">{t('downloads.status_priority')}</Tag>
    ) : (
      <Tag>{t('downloads.status_queued')}</Tag>
    );

  return (
    <List.Item actions={actions}>
      <List.Item.Meta
        avatar={
          task.status === 'processing' ? (
            <Spin size="small" />
          ) : task.type === 'image' ? (
            <PictureOutlined className={styles.typeIcon} aria-label={t('downloads.typeImage')} />
          ) : task.type === 'media' ? (
            <PictureOutlined className={styles.typeIcon} />
          ) : (
            <FileTextOutlined className={styles.typeIcon} />
          )
        }
        title={
          <Space size={4} wrap>
            <Typography.Text strong className={styles.title}>
              {task.channelName ?? '—'}
            </Typography.Text>
            {status}
          </Space>
        }
        description={
          <>
            <Typography.Text className={styles.text} type="secondary" ellipsis>
              {task.newsText?.substring(0, 80) || t('downloads.no_text')}
            </Typography.Text>
            {task.status === 'failed' && task.error && (
              <Typography.Text type="danger" className={styles.error}>
                {task.error}
              </Typography.Text>
            )}
          </>
        }
      />
    </List.Item>
  );
}
