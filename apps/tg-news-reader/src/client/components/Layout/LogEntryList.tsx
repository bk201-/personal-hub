import { createStyles } from 'antd-style';
import React from 'react';
import type { ServerLogEntry } from '../../api/logs';

const LEVEL_LABEL: Record<number, string> = {
  10: 'TRC',
  20: 'DBG',
  30: 'INF',
  40: 'WRN',
  50: 'ERR',
  60: 'FTL',
};

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.6;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    background: ${token.colorBgLayout};
    border-radius: ${token.borderRadius}px;
    padding: 4px 0;
  `,
  row: css`
    display: grid;
    grid-template-columns: 80px 36px 60px 1fr;
    gap: 8px;
    padding: 1px 12px;
    align-items: baseline;
    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  time: css`
    color: ${token.colorTextQuaternary};
    white-space: nowrap;
    flex-shrink: 0;
  `,
  levelDebug: css`
    color: ${token.colorTextSecondary};
  `,
  levelInfo: css`
    color: ${token.colorInfo};
  `,
  levelWarn: css`
    color: ${token.colorWarning};
    font-weight: 600;
  `,
  levelError: css`
    color: ${token.colorError};
    font-weight: 600;
  `,
  levelFatal: css`
    color: ${token.colorError};
    font-weight: 700;
    text-transform: uppercase;
  `,
  module: css`
    color: ${token.colorTextSecondary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  msg: css`
    color: ${token.colorText};
    word-break: break-all;
    white-space: pre-wrap;
  `,
  empty: css`
    text-align: center;
    color: ${token.colorTextSecondary};
    padding: 32px 16px;
  `,
}));

function levelClass(styles: ReturnType<typeof useStyles>['styles'], level: number): string {
  if (level >= 60) return styles.levelFatal;
  if (level >= 50) return styles.levelError;
  if (level >= 40) return styles.levelWarn;
  if (level >= 30) return styles.levelInfo;
  return styles.levelDebug;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Props {
  entries: ServerLogEntry[];
  emptyText: string;
}

export function LogEntryList({ entries, emptyText }: Props) {
  const { styles, cx } = useStyles();

  if (entries.length === 0) {
    return (
      <div className={styles.list}>
        <div className={styles.empty}>{emptyText}</div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {entries.map((e) => (
        <div
          key={`${e.time}-${e.level}-${String(e.module ?? '')}-${String(e.msg).slice(0, 40)}`}
          className={styles.row}
        >
          <span className={styles.time}>{formatTime(e.time)}</span>
          <span className={cx(levelClass(styles, e.level))}>{LEVEL_LABEL[e.level] ?? '???'}</span>
          <span className={styles.module}>{e.module ?? ''}</span>
          <span className={styles.msg}>{e.msg}</span>
        </div>
      ))}
    </div>
  );
}
