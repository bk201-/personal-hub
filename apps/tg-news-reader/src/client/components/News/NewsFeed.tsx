import { VerticalAlignTopOutlined } from '@ant-design/icons';
import { Button, Empty } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Channel } from '../../../shared/types';
import { BP_XL } from '../../hooks/breakpoints';
import { FilterPanel } from '../Filters/FilterPanel';
import { NewsDetail } from './Detail/NewsDetail';
import { DigestDrawer } from './Digest/DigestDrawer';
import { DIGEST_BATCH_SIZE, DigestProgressDrawer } from './Digest/DigestProgressDrawer';
import { NewsFeedList } from './Feed/Desktop/NewsFeedList';
import { NewsAccordionList } from './Feed/Mobile/NewsAccordionList';
import { NewsFeedToolbar } from './Feed/NewsFeedToolbar';
import { TagBrowserModal } from './Feed/TagBrowserModal';
import { LightboxOverlay } from './Lightbox/LightboxOverlay';
import { useNewsFeedState } from './useNewsFeedState';

const ICON_SCROLL_TOP = <VerticalAlignTopOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  feed: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    /* Mobile: parent div is the scroll container */
    @media (max-width: ${BP_XL - 1}px) {
      height: auto;
      overflow: visible;
    }
  `,
  // Toolbar wrapper: sticky on mobile so it pins to top after header scrolls away
  toolbarWrapper: css`
    flex-shrink: 0;
    @media (max-width: ${BP_XL - 1}px) {
      position: sticky;
      top: 0;
      z-index: 50;
      background: ${token.colorBgContainer};
    }
  `,
  // 1px sentinel placed AFTER toolbar — IO watches it to decide when to show the FAB
  topSentinel: css`
    height: 1px;
    flex-shrink: 0;
    pointer-events: none;
  `,
  body: css`
    display: flex;
    flex: 1;
    overflow: hidden;
    @media (max-width: ${BP_XL - 1}px) {
      flex: none;
      overflow: visible;
    }
  `,
  bodyAccordion: css`
    flex-direction: column;
  `,
  detail: css`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgLayout};
  `,
  detailEmpty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  `,
  // Scroll-to-top FAB: initially hidden, DOM-mutated when sentinel exits viewport
  scrollTopBtn: css`
    position: fixed;
    bottom: 24px;
    right: 16px;
    z-index: 99;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    box-shadow: ${token.boxShadow};
  `,
}));

interface NewsFeedProps {
  channel: Channel;
}

export function NewsFeed({ channel }: NewsFeedProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();

  const {
    isLoading,
    displayItems,
    filteredIds,
    selectedNewsId,
    selectedItem,
    newsFilterMode,
    hashTagFilter,
    activeFilterCount,
    effectiveViewMode,
    forceAccordion,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    digestOpen,
    setDigestOpen,
    digestParams,
    visibleNewsIdsChrono,
    tagBrowserOpen,
    setTagBrowserOpen,
    tagCounts,
    toolbarProps,
    setSelectedNewsId,
    handleMarkedRead,
    handleTagClick,
    scrollToTop,
    virtuosoRef,
    scrollTopBtnRef,
    topSentinelRef,
  } = useNewsFeedState(channel);

  // Stabilize refs for the batched-digest drawer so BatchRow (React.memo) is
  // not invalidated on every parent re-render.
  const digestBaseParams = useMemo(() => ({}), []);
  const digestScope = useMemo(() => ({ channelId: channel.id }), [channel.id]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage) void fetchNextPage();
  }, [hasNextPage, fetchNextPage]);
  const handleCloseDigest = useCallback(() => setDigestOpen(false), [setDigestOpen]);
  const handleCloseTagBrowser = useCallback(() => setTagBrowserOpen(false), [setTagBrowserOpen]);
  const handleSetHashTag = useCallback((tag: string | null) => handleTagClick(tag, 'show'), [handleTagClick]);

  return (
    <div className={styles.feed}>
      {/* Toolbar wrapper: sticky top:0 on mobile via CSS @media */}
      <div className={styles.toolbarWrapper}>
        <NewsFeedToolbar {...toolbarProps} />
      </div>

      {/* Sentinel: 1px after toolbar — IO watches this to show/hide scroll-to-top FAB */}
      {forceAccordion && <div ref={topSentinelRef} className={styles.topSentinel} />}

      <div className={cx(styles.body, effectiveViewMode === 'accordion' && styles.bodyAccordion)}>
        {effectiveViewMode === 'accordion' ? (
          <NewsAccordionList
            isLoading={isLoading}
            items={displayItems}
            filteredIds={filteredIds}
            newsFilterMode={newsFilterMode}
            selectedNewsId={selectedNewsId}
            hashTagFilter={hashTagFilter}
            activeFilterCount={activeFilterCount}
            channelTelegramId={channel.telegramId}
            onSelect={setSelectedNewsId}
            onTagClick={handleTagClick}
            onMarkedRead={handleMarkedRead}
            virtuosoRef={virtuosoRef}
            windowScroll
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onEndReached={handleEndReached}
          />
        ) : (
          <>
            <NewsFeedList
              isLoading={isLoading}
              items={displayItems}
              filteredIds={filteredIds}
              newsFilterMode={newsFilterMode}
              selectedNewsId={selectedNewsId}
              hashTagFilter={hashTagFilter}
              activeFilterCount={activeFilterCount}
              onSelect={setSelectedNewsId}
              onTagClick={handleTagClick}
              virtuosoRef={virtuosoRef}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onEndReached={handleEndReached}
            />
            <div className={styles.detail}>
              {selectedItem ? (
                <NewsDetail
                  key={selectedItem.id}
                  item={selectedItem}
                  channelTelegramId={channel.telegramId}
                  onMarkedRead={handleMarkedRead}
                  onTagClick={handleTagClick}
                />
              ) : (
                <div className={styles.detailEmpty}>
                  <Empty description={t('news.list.select_item')} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Scroll-to-top FAB — portaled to body to bypass transform ancestors */}
      {forceAccordion &&
        createPortal(
          <Button
            ref={scrollTopBtnRef}
            type="primary"
            shape="circle"
            size="large"
            icon={ICON_SCROLL_TOP}
            className={styles.scrollTopBtn}
            onClick={scrollToTop}
            aria-label={t('news.scroll_to_top')}
          />,
          document.body,
        )}

      <FilterPanel channelId={channel.id} />
      {visibleNewsIdsChrono.length > DIGEST_BATCH_SIZE ? (
        <DigestProgressDrawer
          open={digestOpen}
          newsIds={visibleNewsIdsChrono}
          baseParams={digestBaseParams}
          scope={digestScope}
          onClose={handleCloseDigest}
        />
      ) : (
        <DigestDrawer open={digestOpen} params={digestParams} onClose={handleCloseDigest} />
      )}
      <TagBrowserModal
        open={tagBrowserOpen}
        channelId={channel.id}
        tagCounts={tagCounts}
        activeHashTag={hashTagFilter}
        onSetHashTag={handleSetHashTag}
        onClose={handleCloseTagBrowser}
      />
      <LightboxOverlay fetchNextPage={fetchNextPage} hasNextPage={hasNextPage ?? false} />
    </div>
  );
}
