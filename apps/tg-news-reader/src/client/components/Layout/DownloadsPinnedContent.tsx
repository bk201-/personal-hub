import { PushpinFilled } from '@ant-design/icons';
import { Button, Space, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelDownload, useDownloads, usePrioritizeDownload } from '../../api/downloads';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { TaskList } from './DownloadTaskList';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  container: css`
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  `,
  header: css`
    padding: 12px 14px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  `,
  headerTitle: css`
    font-size: 13px;
  `,
  pinIcon: css`
    color: ${token.colorPrimary};
  `,
  body: css`
    flex: 1;
    overflow: auto;
    padding: 0 4px;
  `,
}));

/** Inline sidebar rendered next to the news feed when the downloads panel is pinned. */
export function DownloadsPinnedContent() {
  const { styles } = useStyles();
  const { data: tasks = [] } = useDownloads();
  const cancelDownload = useCancelDownload();
  const prioritizeDownload = usePrioritizeDownload();
  const { toggleDownloadsPanelPin } = useUIStore();
  const { t } = useTranslation();

  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const pinIcon = useMemo(() => <PushpinFilled className={styles.pinIcon} />, [styles.pinIcon]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Space size={6}>
          {activeCount > 0 && <Spin size="small" />}
          <Text strong className={styles.headerTitle}>
            {activeCount > 0 ? t('downloads.title_active_pinned', { count: activeCount }) : t('downloads.title')}
          </Text>
        </Space>
        <Tooltip title={t('downloads.unpin_tooltip')} placement="left">
          <Button type="text" icon={pinIcon} onClick={toggleDownloadsPanelPin} />
        </Tooltip>
      </div>
      <div className={styles.body}>
        <TaskList tasks={tasks} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
      </div>
    </div>
  );
}
