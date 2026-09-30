import type { NewsItem } from '@shared/types.ts';
import { createStyles } from 'antd-style';
import React, { memo, useCallback } from 'react';
import type { NewsFilterMode } from '../../../../store/uiStore';
import { NewsDetail } from '../../Detail/NewsDetail';
import { NewsListItem } from '../NewsListItem';

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    border-bottom: 1px solid ${token.colorBorderSecondary};
    /* Disable browser double-tap-to-zoom so our custom double-tap handler works */
    touch-action: manipulation;
    /* Remove the inner item's own bottom border — accordion wrapper provides it */
    & > div:first-child {
      border-bottom: none;
    }
  `,
  itemExpanded: css`
    border-left: 3px solid ${token.colorPrimary};
  `,
  itemDimmed: css`
    opacity: 0.45;
  `,
}));

interface NewsAccordionItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean;
  newsFilterMode: NewsFilterMode;
  channelTelegramId: string;
  onSelect: (id: number | null) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  onMarkedRead: (id: number) => void;
}

export const NewsAccordionItem = memo(
  function NewsAccordionItem({
    item,
    isSelected,
    isFiltered,
    newsFilterMode,
    channelTelegramId,
    onSelect,
    onTagClick,
    onMarkedRead,
  }: NewsAccordionItemProps) {
    const { styles, cx } = useStyles();

    const handleHeaderClick = useCallback(() => onSelect(null), [onSelect]);

    if (newsFilterMode === 'filtered' && !isFiltered) return null;

    const dimmed = newsFilterMode === 'all' && !isFiltered;

    return (
      <div
        data-news-id={item.id}
        aria-expanded={isSelected}
        className={cx(styles.item, isSelected && styles.itemExpanded, dimmed && styles.itemDimmed)}
      >
        {isSelected ? (
          <NewsDetail
            key={item.id}
            item={item}
            channelTelegramId={channelTelegramId}
            onMarkedRead={onMarkedRead}
            variant="inline"
            onHeaderClick={handleHeaderClick}
            onTagClick={onTagClick}
          />
        ) : (
          <NewsListItem
            item={item}
            isSelected={false}
            isFiltered={isFiltered}
            newsFilterMode={newsFilterMode}
            onClick={onSelect}
            onTagClick={onTagClick}
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.isSelected === next.isSelected &&
    prev.isFiltered === next.isFiltered &&
    prev.newsFilterMode === next.newsFilterMode &&
    prev.channelTelegramId === next.channelTelegramId,
);
