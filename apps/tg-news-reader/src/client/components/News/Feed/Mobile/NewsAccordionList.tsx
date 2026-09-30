import type { NewsItem } from '@shared/types.ts';
import { Empty, Spin } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { BP_XL, MOBILE_TOOLBAR_HEIGHT } from '../../../../hooks/breakpoints';
import type { NewsFilterMode } from '../../../../store/uiStore';
import { NewsAccordionItem } from './NewsAccordionItem';

const VIRTUOSO_HEIGHT_FULL = { height: '100%' };

const useStyles = createStyles(({ css, token }) => ({
  accordion: css`
    flex: 1;
    overflow-y: auto;
    position: relative;
    background: ${token.colorBgContainer};
    overscroll-behavior-y: contain;
    /* Mobile: parent div is the scroll container — no inner scroll */
    @media (max-width: ${BP_XL - 1}px) {
      flex: none;
      overflow-y: visible;
      height: auto;
    }
  `,
  virtuoso: css`
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
  // Ensure selected items scroll into view below sticky toolbar on mobile
  item: css`
    @media (max-width: ${BP_XL - 1}px) {
      scroll-margin-top: ${MOBILE_TOOLBAR_HEIGHT + 8}px;
    }
  `,
}));

interface NewsAccordionListProps {
  isLoading: boolean;
  items: NewsItem[];
  filteredIds: Set<number>;
  newsFilterMode: NewsFilterMode;
  selectedNewsId: number | null;
  hashTagFilter: string | null;
  activeFilterCount: number;
  channelTelegramId: string;
  onSelect: (id: number | null) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  onMarkedRead: (id: number) => void;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  /** Mobile: use window as scroll parent so browser chrome hides on scroll */
  windowScroll?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onEndReached?: () => void;
}

export function NewsAccordionList({
  isLoading,
  items,
  filteredIds,
  newsFilterMode,
  selectedNewsId,
  hashTagFilter,
  activeFilterCount,
  channelTelegramId,
  onSelect,
  onTagClick,
  onMarkedRead,
  virtuosoRef,
  windowScroll,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
}: NewsAccordionListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  const renderItem = useCallback(
    (_: number, item: NewsItem) => (
      <div data-news-id={item.id} className={styles.item}>
        <NewsAccordionItem
          item={item}
          isSelected={selectedNewsId === item.id}
          isFiltered={filteredIds.has(item.id)}
          newsFilterMode={newsFilterMode}
          channelTelegramId={channelTelegramId}
          onSelect={onSelect}
          onTagClick={onTagClick}
          onMarkedRead={onMarkedRead}
        />
      </div>
    ),
    [selectedNewsId, filteredIds, newsFilterMode, channelTelegramId, onSelect, onTagClick, onMarkedRead, styles.item],
  );

  const footer = useCallback(
    () =>
      isFetchingNextPage ? (
        <div className={styles.loadingWrap}>
          <Spin size="small" />
        </div>
      ) : null,
    [isFetchingNextPage, styles.loadingWrap],
  );

  const virtuosoComponents = useMemo(() => ({ Footer: footer }), [footer]);

  return (
    <div role="list" aria-label={t('news.list.list_label')} className={styles.accordion}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
      {!isLoading && items.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          className={windowScroll ? undefined : styles.virtuoso}
          data={items}
          overscan={500}
          useWindowScroll={windowScroll}
          style={windowScroll ? undefined : VIRTUOSO_HEIGHT_FULL}
          itemContent={renderItem}
          endReached={hasNextPage ? onEndReached : undefined}
          components={virtuosoComponents}
        />
      )}
    </div>
  );
}
