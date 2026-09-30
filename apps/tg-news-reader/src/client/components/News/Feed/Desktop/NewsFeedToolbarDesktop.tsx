import {
  BulbOutlined,
  CheckSquareOutlined,
  CloseCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FilterOutlined,
  LayoutOutlined,
  LinkOutlined,
  ProfileOutlined,
  SyncOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Button, Segmented, Space, Tag, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../../../common/MaybeTooltip';
import type { NewsFeedToolbarProps } from '../newsFeedToolbarTypes';

const { Text } = Typography;

const ICON_SYNC = <SyncOutlined />;
const ICON_LINK = <LinkOutlined />;
const ICON_EYE = <EyeOutlined />;
const ICON_EYE_INVISIBLE = <EyeInvisibleOutlined />;
const ICON_CHECK_SQUARE = <CheckSquareOutlined />;
const ICON_FILTER = <FilterOutlined />;
const ICON_BULB = <BulbOutlined />;
const ICON_TAGS = <TagsOutlined />;
const ICON_CLOSE_CIRCLE = <CloseCircleOutlined />;
const ICON_LAYOUT = <LayoutOutlined />;
const ICON_PROFILE = <ProfileOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    flex-shrink: 0;
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  divider: css`
    width: 1px;
    height: 1.4em;
    background: ${token.colorBorderSecondary};
    margin: 0 2px;
    flex-shrink: 0;
    align-self: center;
  `,
  hashTag: css`
    font-size: 13px;
    padding: 2px 8px;
  `,
  stats: css`
    font-size: 12px;
  `,
}));

export function NewsFeedToolbarDesktop({
  fetchPending,
  fetchPeriod,
  onFetchDefault,
  onFetchPeriod,
  newsFilterMode,
  onCycleFilterMode,
  markAllPending,
  onMarkAllRead,
  onOpenFilters,
  hashTagFilter,
  onClearHashTag,
  shownCount,
  hiddenCount,
  totalCount,
  unreadCount,
  newsViewMode,
  onSetViewMode,
  onOpenDigest,
  showDigest = true,
  channelTelegramId,
  hasTags,
  onOpenTagBrowser,
}: NewsFeedToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const periodOptions = useMemo(
    () => [
      { value: '1', label: t('news.period.1d') },
      { value: '3', label: t('news.period.3d') },
      { value: '5', label: t('news.period.5d') },
      { value: '7', label: t('news.period.7d') },
      { value: '14', label: t('news.period.14d') },
    ],
    [t],
  );

  const handleSetViewList = useCallback(() => onSetViewMode('list'), [onSetViewMode]);
  const handleSetViewAccordion = useCallback(() => onSetViewMode('accordion'), [onSetViewMode]);

  const filterModeIcon = newsFilterMode === 'hidden' ? ICON_EYE_INVISIBLE : ICON_EYE;
  const filterModeLabel = t(`news.toolbar.mode_label.${newsFilterMode}`);
  const filterModeButtonType: 'default' | 'primary' = newsFilterMode === 'all' ? 'primary' : 'default';
  // 'hidden' gets danger styling to make the unusual state visually obvious
  const filterModeDanger = newsFilterMode === 'hidden';

  return (
    <div className={styles.toolbar}>
      <Space wrap>
        <Tooltip title={t('news.toolbar.fetch_default_tooltip')}>
          <Button icon={ICON_SYNC} onClick={onFetchDefault} loading={fetchPending} />
        </Tooltip>
        <Segmented options={periodOptions} value={fetchPeriod} onChange={onFetchPeriod} disabled={fetchPending} />
        {channelTelegramId && (
          <Tooltip title={t('channels.open_tg_tooltip')}>
            <Button
              size="small"
              icon={ICON_LINK}
              href={`https://t.me/${channelTelegramId}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          </Tooltip>
        )}
        <Tooltip title={t('news.toolbar.mode_tooltip')}>
          <Button
            icon={filterModeIcon}
            type={filterModeButtonType}
            danger={filterModeDanger}
            onClick={onCycleFilterMode}
          >
            {filterModeLabel}
          </Button>
        </Tooltip>
        <Tooltip title={t('news.toolbar.mark_all_read_tooltip')}>
          <Button icon={ICON_CHECK_SQUARE} onClick={onMarkAllRead} loading={markAllPending}>
            {t('news.toolbar.mark_all_read')}
          </Button>
        </Tooltip>
        <Tooltip title={t('news.toolbar.filter_tooltip')}>
          <Button icon={ICON_FILTER} onClick={onOpenFilters}>
            {t('news.toolbar.filter')}
          </Button>
        </Tooltip>
        {showDigest && (
          <Tooltip title={t('digest.tooltip')}>
            <Button icon={ICON_BULB} onClick={onOpenDigest}>
              {t('digest.button')}
            </Button>
          </Tooltip>
        )}
        {hasTags && onOpenTagBrowser && (
          <Tooltip title={t('tags.button_tooltip')}>
            <Button icon={ICON_TAGS} onClick={onOpenTagBrowser} />
          </Tooltip>
        )}
        {hashTagFilter && (
          <Tag color="blue" closeIcon={ICON_CLOSE_CIRCLE} onClose={onClearHashTag} className={styles.hashTag}>
            {hashTagFilter}
          </Tag>
        )}
        <>
          <div className={styles.divider} />
          <Tooltip title={t('news.toolbar.view_list')}>
            <Button
              size="small"
              icon={ICON_LAYOUT}
              type={newsViewMode === 'list' ? 'primary' : 'default'}
              onClick={handleSetViewList}
            />
          </Tooltip>
          <Tooltip title={t('news.toolbar.view_accordion')}>
            <Button
              size="small"
              icon={ICON_PROFILE}
              type={newsViewMode === 'accordion' ? 'primary' : 'default'}
              onClick={handleSetViewAccordion}
            />
          </Tooltip>
        </>
      </Space>

      <Space size={12} className={styles.stats}>
        <Text type="secondary">{t('news.toolbar.shown', { count: shownCount })}</Text>
        {hiddenCount > 0 && <Text type="secondary">{t('news.toolbar.hidden', { count: hiddenCount })}</Text>}
        <Text type="secondary">{t('news.toolbar.total', { count: totalCount })}</Text>
        {unreadCount > 0 && <Text type="secondary">{t('news.toolbar.unread', { count: unreadCount })}</Text>}
      </Space>
    </div>
  );
}
