import type { NewsItem } from '@shared/types.ts';
import { Empty, Spin } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { NewsFilterMode } from '../../../../store/uiStore';
import { NewsListItem } from '../NewsListItem';

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    width: 380px;
    min-width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  virtuoso: css`
    flex: 1;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  loadingWrap: css`
    display: flex;
    justify-content: center;
    padding: 32px;
  `,
  empty: css`
    margin-top: 48px;
  `,
  loadingMore: css`
    display: flex;
    justify-content: center;
    padding: 12px;
  `,
}));

interface NewsFeedListProps {
  isLoading: boolean;
  items: NewsItem[];
  filteredIds: Set<number>;
  newsFilterMode: NewsFilterMode;
  selectedNewsId: number | null;
  hashTagFilter: string | null;
  activeFilterCount: number;
  onSelect: (id: number) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onEndReached?: () => void;
}

export function NewsFeedList({
  isLoading,
  items,
  filteredIds,
  newsFilterMode,
  selectedNewsId,
  hashTagFilter,
  activeFilterCount,
  onSelect,
  onTagClick,
  virtuosoRef,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
}: NewsFeedListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const renderItem = useCallback(
    (_: number, item: NewsItem) => (
      <NewsListItem
        item={item}
        isSelected={selectedNewsId === item.id}
        isFiltered={filteredIds.has(item.id)}
        newsFilterMode={newsFilterMode}
        onClick={onSelect}
        onTagClick={onTagClick}
      />
    ),
    [selectedNewsId, filteredIds, newsFilterMode, onSelect, onTagClick],
  );

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  const footer = useCallback(
    () =>
      isFetchingNextPage ? (
        <div className={styles.loadingMore}>
          <Spin size="small" />
        </div>
      ) : null,
    [isFetchingNextPage, styles.loadingMore],
  );

  const virtuosoComponents = useMemo(() => ({ Footer: footer }), [footer]);

  return (
    <div role="listbox" aria-label={t('news.list.list_label')} className={styles.list}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
      {!isLoading && items.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          className={styles.virtuoso}
          data={items}
          overscan={400}
          itemContent={renderItem}
          endReached={hasNextPage ? onEndReached : undefined}
          components={virtuosoComponents}
        />
      )}
    </div>
  );
}
