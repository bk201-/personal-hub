import { WarningOutlined } from '@ant-design/icons';
import type { Channel } from '@shared/types.ts';
import { Badge, Typography } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { ChannelItemActions } from './ChannelItemActions';
import { formatUnreadBadgeCount } from './formatUnreadBadgeCount';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin: 2px 6px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    &:hover {
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
  `,
  info: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  `,
  rightSide: css`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  `,
  warningIcon: css`
    color: ${token.colorError};
    margin-right: 4px;
  `,
  metaText: css`
    font-size: 11px;
  `,
}));

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  isFetchingThis: boolean;
  unreadCount: number;
  onSelect: (id: number) => void;
  onFetch: (channel: Channel) => void;
  onEdit: (channel: Channel) => void;
  onDelete: (channel: Channel) => void;
}

export function ChannelItem({
  channel: ch,
  isSelected,
  isFetchingThis,
  unreadCount,
  onSelect,
  onFetch,
  onEdit,
  onDelete,
}: ChannelItemProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();

  const handleSelect = useCallback(() => onSelect(ch.id), [onSelect, ch.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect],
  );

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cx(styles.item, isSelected && styles.itemActive)}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.info}>
        <Text strong ellipsis>
          {ch.isUnavailable ? (
            <Tooltip title={t('channels.unavailable_tooltip')}>
              <WarningOutlined className={styles.warningIcon} />
            </Tooltip>
          ) : null}
          {ch.name}
        </Text>
        <Text type="secondary" className={styles.metaText}>
          @{ch.telegramId}
        </Text>
        {ch.lastFetchedAt && (
          <Text type="secondary" className={styles.metaText}>
            {t('channels.updated', { date: dayjs.unix(ch.lastFetchedAt).format('DD.MM.YY HH:mm') })}
          </Text>
        )}
      </div>
      <div className={styles.rightSide}>
        <Badge count={formatUnreadBadgeCount(unreadCount)} overflowCount={9999} size="small" />
        <ChannelItemActions
          channel={ch}
          isFetching={isFetchingThis}
          onFetch={onFetch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
