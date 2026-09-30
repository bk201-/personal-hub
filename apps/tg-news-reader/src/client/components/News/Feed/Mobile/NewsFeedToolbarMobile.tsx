import {
  BulbOutlined,
  CheckSquareOutlined,
  CloseCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FilterOutlined,
  LinkOutlined,
  MoreOutlined,
  SyncOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewsFeedToolbarProps } from '../newsFeedToolbarTypes';

const { Text } = Typography;

const ICON_SYNC = <SyncOutlined />;
const ICON_MORE = <MoreOutlined />;
const ICON_CLOSE_CIRCLE = <CloseCircleOutlined />;
const ICON_EYE = <EyeOutlined />;
const ICON_EYE_INVISIBLE = <EyeInvisibleOutlined />;
const DROPDOWN_TRIGGER: ['click'] = ['click'];

const useStyles = createStyles(({ css, token }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  hashTagCompact: css`
    font-size: 12px;
    padding: 0 6px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  statsCompact: css`
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
  `,
}));

export function NewsFeedToolbarMobile({
  fetchPending,
  onFetchDefault,
  onFetchPeriod,
  newsFilterMode,
  onCycleFilterMode,
  onMarkAllRead,
  onOpenFilters,
  hashTagFilter,
  onClearHashTag,
  hiddenCount,
  totalCount,
  unreadCount,
  onOpenDigest,
  showDigest = true,
  channelTelegramId,
  hasTags,
  onOpenTagBrowser,
}: NewsFeedToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const handleFetchPeriod = useCallback((val: string | number) => onFetchPeriod(val), [onFetchPeriod]);

  const statParts = [
    unreadCount > 0 && t('news.toolbar.unread', { count: unreadCount }),
    t('news.toolbar.total', { count: totalCount }),
    hiddenCount > 0 && t('news.toolbar.hidden', { count: hiddenCount }),
  ].filter(Boolean) as string[];

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'fetch',
        icon: ICON_SYNC,
        label: t('news.toolbar.fetch_default_tooltip').replace(' · [U]', ''),
        onClick: onFetchDefault,
      },
      // Period items directly in the flat menu — avoids submenu close bug on mobile
      { type: 'divider' },
      { key: 'period_label', type: 'group', label: t('news.toolbar.fetch_period'), children: [] },
      { key: 'p1', label: t('news.period.1d'), onClick: () => handleFetchPeriod('1') },
      { key: 'p3', label: t('news.period.3d'), onClick: () => handleFetchPeriod('3') },
      { key: 'p5', label: t('news.period.5d'), onClick: () => handleFetchPeriod('5') },
      { key: 'p7', label: t('news.period.7d'), onClick: () => handleFetchPeriod('7') },
      { key: 'p14', label: t('news.period.14d'), onClick: () => handleFetchPeriod('14') },
      { type: 'divider' },
      {
        key: 'toggle_mode',
        icon: newsFilterMode === 'hidden' ? ICON_EYE_INVISIBLE : ICON_EYE,
        label: t('news.toolbar.mode_cycle_label', {
          current: t(`news.toolbar.mode_label.${newsFilterMode}`),
        }),
        onClick: onCycleFilterMode,
      },
      {
        key: 'mark_read',
        icon: <CheckSquareOutlined />,
        label: t('news.toolbar.mark_all_read'),
        onClick: onMarkAllRead,
      },
      {
        key: 'filters',
        icon: <FilterOutlined />,
        label: t('news.toolbar.filter'),
        onClick: onOpenFilters,
      },
      ...(channelTelegramId
        ? [
            {
              key: 'open_tg',
              icon: <LinkOutlined />,
              label: (
                <a href={`https://t.me/${channelTelegramId}`} target="_blank" rel="noopener noreferrer">
                  {t('channels.open_tg_tooltip')}
                </a>
              ),
            } as NonNullable<MenuProps['items']>[number],
          ]
        : []),
      ...(showDigest
        ? [{ key: 'digest', icon: <BulbOutlined />, label: t('digest.button'), onClick: onOpenDigest }]
        : []),
      ...(hasTags && onOpenTagBrowser
        ? [
            {
              key: 'tag_browser',
              icon: <TagsOutlined />,
              label: t('tags.button_tooltip'),
              onClick: onOpenTagBrowser,
            } as NonNullable<MenuProps['items']>[number],
          ]
        : []),
      ...(hashTagFilter
        ? [
            { type: 'divider' } as NonNullable<MenuProps['items']>[number],
            {
              key: 'clear_tag',
              icon: ICON_CLOSE_CIRCLE,
              label: t('news.toolbar.clear_tag', { tag: hashTagFilter }),
              onClick: onClearHashTag,
            } as NonNullable<MenuProps['items']>[number],
          ]
        : []),
    ],
    [
      t,
      onFetchDefault,
      handleFetchPeriod,
      newsFilterMode,
      onCycleFilterMode,
      onMarkAllRead,
      onOpenFilters,
      channelTelegramId,
      showDigest,
      onOpenDigest,
      hasTags,
      onOpenTagBrowser,
      hashTagFilter,
      onClearHashTag,
    ],
  );

  const dropdownMenu = useMemo(() => ({ items: menuItems }), [menuItems]);

  return (
    <div className={styles.toolbar}>
      <Space size={6}>
        {hashTagFilter && (
          <Tag color="blue" closeIcon={ICON_CLOSE_CIRCLE} onClose={onClearHashTag} className={styles.hashTagCompact}>
            #{hashTagFilter}
          </Tag>
        )}
        <Text type="secondary" className={styles.statsCompact}>
          {statParts.join(' · ')}
        </Text>
      </Space>

      <Space size={4}>
        {/* Always-visible fetch button so loading state is obvious on mobile */}
        <Button type="text" icon={ICON_SYNC} size="middle" loading={fetchPending} onClick={onFetchDefault} />
        <Dropdown menu={dropdownMenu} trigger={DROPDOWN_TRIGGER} placement="bottomRight">
          <Button type="text" icon={ICON_MORE} size="middle" />
        </Dropdown>
      </Space>
    </div>
  );
}
