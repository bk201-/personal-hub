import { FileTextOutlined, ReloadOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { Badge, Button, Drawer, Select, Tooltip, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HOURS_OPTIONS, LOG_LEVEL_OPTIONS, useServerLogs } from '../../api/logs';
import type { ServerLogEntry } from '../../api/logs';
import { LogEntryList } from './LogEntryList';

const { Text } = Typography;

const ICON_FILE_TEXT = <FileTextOutlined />;
const ICON_SCROLL_BOTTOM = <VerticalAlignBottomOutlined />;
const BADGE_OFFSET: [number, number] = [-4, 4];
const DRAWER_BODY_STYLES = { body: { padding: 0 } };
const LEVEL_OPTIONS = LOG_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const HOURS_SELECT_OPTIONS = HOURS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const EMPTY_ENTRIES: ServerLogEntry[] = [];

const useStyles = createStyles(({ css, token }) => ({
  iconBtn: css`
    color: ${token.colorTextLightSolid};
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  `,
  meta: css`
    font-size: 11px;
    color: ${token.colorTextQuaternary};
    margin-left: auto;
  `,
  drawerBody: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 12px 16px;
  `,
  logList: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  `,
  levelSelect: css`
    width: 90px;
  `,
  hoursSelect: css`
    width: 80px;
  `,
}));

export function LogsPanel() {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(2);
  const [level, setLevel] = useState('info');
  const { styles } = useStyles();
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, refetch } = useServerLogs(hours, level, open);
  const entries = data?.entries ?? EMPTY_ENTRIES;
  const errorCount = entries.filter((e) => e.level >= 50).length;

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleScrollBottom = useCallback(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);
  const handleRefetch = useCallback(() => void refetch(), [refetch]);

  const reloadIcon = useMemo(() => <ReloadOutlined spin={isFetching} />, [isFetching]);

  return (
    <>
      <Tooltip title={t('logs.button_tooltip')}>
        <Badge count={errorCount} size="small" offset={BADGE_OFFSET}>
          <Button
            type="text"
            icon={ICON_FILE_TEXT}
            onClick={handleOpen}
            aria-label={t('logs.button_tooltip')}
            className={styles.iconBtn}
          />
        </Badge>
      </Tooltip>

      <Drawer
        title={t('logs.title')}
        placement="right"
        size="large"
        open={open}
        onClose={handleClose}
        mask={false}
        styles={DRAWER_BODY_STYLES}
      >
        <div className={styles.drawerBody}>
          <div className={styles.toolbar}>
            <Select
              size="small"
              value={level}
              onChange={setLevel}
              options={LEVEL_OPTIONS}
              className={styles.levelSelect}
            />
            <Select
              size="small"
              value={hours}
              onChange={setHours}
              options={HOURS_SELECT_OPTIONS}
              className={styles.hoursSelect}
            />
            <Button size="small" icon={reloadIcon} onClick={handleRefetch}>
              {t('logs.refresh')}
            </Button>
            <Button
              size="small"
              icon={ICON_SCROLL_BOTTOM}
              onClick={handleScrollBottom}
              title={t('logs.scroll_bottom')}
            />
            <Text className={styles.meta}>
              {t('logs.entry_count', { count: entries.length })}
              {data && ` · ${t('logs.buffer_size', { count: data.bufferSize })}`}
            </Text>
          </div>

          <div ref={listRef} className={styles.logList}>
            <LogEntryList entries={entries} emptyText={t('logs.empty')} />
          </div>
        </div>
      </Drawer>
    </>
  );
}
