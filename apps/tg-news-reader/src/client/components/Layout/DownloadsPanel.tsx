import { CloudDownloadOutlined, PushpinOutlined } from '@ant-design/icons';
import { Badge, Button, Drawer, Space, Spin } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelDownload, useDownloads, useDownloadsSSE, usePrioritizeDownload } from '../../api/downloads';
import { useIsXxl } from '../../hooks/breakpoints';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { TaskList } from './DownloadTaskList';

const ICON_PUSHPIN = <PushpinOutlined />;
const ICON_CLOUD_DOWNLOAD = <CloudDownloadOutlined />;
const BADGE_OFFSET: [number, number] = [-4, 4];

const useStyles = createStyles(({ css, token }, pinned: boolean) => ({
  iconBtn: css`
    color: ${token.colorTextLightSolid};
    opacity: ${pinned ? 0.75 : 1};
  `,
  drawerTitle: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 4px;
  `,
}));

/** Header badge button + Drawer (used when panel is NOT pinned).
 *  Also mounts useDownloadsSSE() once for the whole app lifetime. */
export function DownloadsPanel() {
  const [open, setOpen] = useState(false);
  const { data: tasks = [] } = useDownloads();
  const cancelDownload = useCancelDownload();
  const prioritizeDownload = usePrioritizeDownload();
  const { downloadsPanelPinned, toggleDownloadsPanelPin } = useUIStore();
  const { t } = useTranslation();
  const isXxl = useIsXxl();

  // Pin only available on full desktop (≥ 1600px / xxl)
  const effectivePinned = isXxl && downloadsPanelPinned;
  const { styles } = useStyles(effectivePinned);

  // SSE always active — mounted once for the whole app lifetime
  useDownloadsSSE();

  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;

  const handleOpen = useCallback(() => {
    if (!effectivePinned) setOpen(true);
  }, [effectivePinned]);

  const handleClose = useCallback(() => setOpen(false), []);

  const handlePinClick = useCallback(() => {
    toggleDownloadsPanelPin();
    setOpen(false);
  }, [toggleDownloadsPanelPin]);

  const drawerTitle = useMemo(
    () => (
      <div className={styles.drawerTitle}>
        <Space size={6}>
          {activeCount > 0 && <Spin size="small" />}
          <span>{activeCount > 0 ? t('downloads.title_active', { count: activeCount }) : t('downloads.title')}</span>
        </Space>
        {isXxl && (
          <Tooltip title={t('downloads.pin_tooltip')} placement="left">
            <Button size="small" type="text" icon={ICON_PUSHPIN} onClick={handlePinClick} />
          </Tooltip>
        )}
      </div>
    ),
    [styles.drawerTitle, activeCount, t, isXxl, handlePinClick],
  );

  return (
    <>
      <Tooltip
        title={effectivePinned ? t('downloads.panel_tooltip_pinned') : t('downloads.panel_tooltip')}
        placement="bottomLeft"
      >
        <Badge count={activeCount} size="small" offset={BADGE_OFFSET}>
          <Button type="text" icon={ICON_CLOUD_DOWNLOAD} onClick={handleOpen} className={styles.iconBtn} />
        </Badge>
      </Tooltip>

      {!effectivePinned && (
        <Drawer title={drawerTitle} placement="right" size="default" open={open} onClose={handleClose} mask={false}>
          <TaskList tasks={tasks} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
        </Drawer>
      )}
    </>
  );
}
