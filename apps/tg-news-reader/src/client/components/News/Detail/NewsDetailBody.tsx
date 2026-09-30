import { DownloadOutlined, LoadingOutlined, MinusOutlined, PlusOutlined, RetweetOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { Button, Divider, Modal, Radio, Typography } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/uiStore';
import { isYouTubeUrl } from '../newsUtils';
import { NewsArticleBody } from './NewsArticleBody';
import { NewsDetailMedia } from './NewsDetailMedia';
import { NewsTextBlock } from './NewsTextBlock';
import { NewsYouTubeEmbeds } from './NewsYouTubeEmbeds';

const DOUBLE_TAP_MS = 350;
const FONT_SIZE_STEP = 10;
const FONT_SIZE_MIN = 100;
const FONT_SIZE_MAX = 200;

/** Tags that should NOT trigger double-tap (interactive / media elements) */
const DOUBLE_TAP_EXCLUDED_TAGS = new Set(['a', 'button', 'img', 'video', 'audio', 'input', 'textarea', 'svg', 'path']);

/** Selectors for interactive containers whose children should be excluded */
const INTERACTIVE_SELECTOR = 'a, button, .ant-btn, .carousel-btn';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  content: css`
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
    /* Show font size controls on hover — desktop / pointer devices only */
    @media (hover: hover) and (pointer: fine) {
      &:hover .font-size-bar {
        opacity: 1;
        pointer-events: auto;
      }
    }
  `,
  contentInline: css`
    flex: none;
    overflow: visible;
  `,
  textBody: css`
    width: 100%;
    max-width: 680px;
    min-width: 0;
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  loadBtnWrap: css`
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  `,
  errorText: css`
    font-size: 12px;
    color: ${token.colorError};
  `,
  dividerLabel: css`
    font-size: 12px;
  `,
  radioGroup: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  radioLink: css`
    font-size: 12px;
  `,
  fontSizeBar: css`
    position: sticky;
    top: 8px;
    align-self: flex-end;
    margin-right: 4px;
    margin-bottom: -36px;
    display: flex;
    align-items: center;
    gap: 2px;
    background: ${token.colorBgElevated};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 20px;
    padding: 2px 6px;
    box-shadow: ${token.boxShadowSecondary};
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s;
    z-index: 5;
    /* Touch devices have no hover — hide the bar entirely (it would never appear) */
    @media (hover: none), (pointer: coarse) {
      display: none;
    }
  `,
  fontSizeLabel: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
    min-width: 36px;
    text-align: center;
    user-select: none;
  `,
  forwardBadge: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: ${token.colorTextTertiary};
    margin-bottom: 4px;
    width: 100%;
  `,
  forwardName: css`
    font-style: italic;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

const ICON_DOWNLOAD = <DownloadOutlined />;
const ICON_LOADING = <LoadingOutlined />;
const ICON_MINUS = <MinusOutlined />;
const ICON_PLUS = <PlusOutlined />;
const TOUCH_ACTION_MANIPULATION = { touchAction: 'manipulation' as const };
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

interface NewsDetailBodyProps {
  item: NewsItem;
  links: string[];
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  /** true when the post is an audio message */
  isAudio: boolean;
  albumIndex: number;
  albumLength: number;
  albumExpectedLength: number;
  onAlbumNav: (delta: -1 | 1) => void;
  mediaLoading: boolean;
  mediaQueued: boolean;
  mediaTaskStatus?: string;
  mediaTaskError?: string;
  onDownload: () => void;
  articleLoading: boolean;
  articleQueued: boolean;
  articleTaskStatus?: string;
  articleTaskError?: string;
  onExtractClick: () => void;
  linkModalOpen: boolean;
  selectedUrl: string;
  onSelectedUrlChange: (url: string) => void;
  onModalConfirm: () => void;
  onModalCancel: () => void;
  variant?: 'panel' | 'inline';
  /** Double-tap on body text area (mobile) — triggers mark-read */
  onDoubleTap?: () => void;
  /** Ref forwarded to the active <video> element (for pausing before lightbox opens) */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function NewsDetailBody({
  item,
  links,
  firstMediaPath,
  isAlbum,
  isVideo,
  isAudio,
  albumIndex,
  albumLength,
  albumExpectedLength,
  onAlbumNav,
  mediaLoading,
  mediaQueued,
  mediaTaskStatus,
  mediaTaskError,
  onDownload,
  articleLoading,
  articleQueued,
  articleTaskStatus,
  articleTaskError,
  onExtractClick,
  linkModalOpen,
  selectedUrl,
  onSelectedUrlChange,
  onModalConfirm,
  onModalCancel,
  variant = 'panel',
  onDoubleTap,
  videoRef,
}: NewsDetailBodyProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();
  const { newsFontSize, setNewsFontSize } = useUIStore();

  const handleDecrease = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNewsFontSize(newsFontSize - FONT_SIZE_STEP);
    },
    [newsFontSize, setNewsFontSize],
  );
  const handleIncrease = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNewsFontSize(newsFontSize + FONT_SIZE_STEP);
    },
    [newsFontSize, setNewsFontSize],
  );

  const textBodyStyle = useMemo(() => ({ zoom: newsFontSize / 100 }), [newsFontSize]);

  // ── Double-tap detection (mobile mark-read on body text) ──────────
  const lastTapRef = useRef(0);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!onDoubleTap) return;
      const tag = (e.target as HTMLElement).tagName?.toLowerCase();
      if (DOUBLE_TAP_EXCLUDED_TAGS.has(tag)) return;
      if ((e.target as HTMLElement).closest?.(INTERACTIVE_SELECTOR)) return;

      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        onDoubleTap();
      } else {
        lastTapRef.current = now;
      }
    },
    [onDoubleTap],
  );

  const handleUrlChange = useCallback(
    (e: RadioChangeEvent) => onSelectedUrlChange(e.target.value as string),
    [onSelectedUrlChange],
  );

  // Show the text infoblock only when there's actual post text
  const showTextBlock = item.textInPanel !== 1 && !(item.canLoadArticle === 1 && item.fullContent) && !!item.text;

  // Show the load button below the text block (or standalone) when article is not yet loaded
  const showLoadBtn =
    item.canLoadArticle === 1 && !item.fullContent && links.filter((l) => !isYouTubeUrl(l)).length > 0;

  // Article zone: fullContent when canLoadArticle=1, OR secondary content otherwise
  const articleContent = item.fullContent;
  const articleFormat = item.fullContentFormat ?? 'text';

  return (
    <>
      <div
        className={cx(styles.content, variant === 'inline' && styles.contentInline)}
        onTouchEnd={handleTouchEnd}
        style={onDoubleTap ? TOUCH_ACTION_MANIPULATION : undefined}
      >
        {/* Font size controls — appear on hover at top-right of the content area */}
        <div className={cx(styles.fontSizeBar, 'font-size-bar')} onClick={stopPropagation}>
          <Button
            type="text"
            size="small"
            icon={ICON_MINUS}
            onClick={handleDecrease}
            disabled={newsFontSize <= FONT_SIZE_MIN}
            aria-label={t('news.detail.font_size_decrease')}
          />
          <span className={styles.fontSizeLabel}>{newsFontSize}%</span>
          <Button
            type="text"
            size="small"
            icon={ICON_PLUS}
            onClick={handleIncrease}
            disabled={newsFontSize >= FONT_SIZE_MAX}
            aria-label={t('news.detail.font_size_increase')}
          />
        </div>

        <NewsDetailMedia
          item={item}
          firstMediaPath={firstMediaPath}
          isAlbum={isAlbum}
          isVideo={isVideo}
          isAudio={isAudio}
          albumIndex={albumIndex}
          albumLength={albumLength}
          albumExpectedLength={albumExpectedLength}
          onAlbumNav={onAlbumNav}
          mediaLoading={mediaLoading}
          mediaQueued={mediaQueued}
          mediaTaskStatus={mediaTaskStatus}
          mediaTaskError={mediaTaskError}
          onDownload={onDownload}
          videoRef={videoRef}
        />

        <div className={styles.textBody} style={textBodyStyle}>
          {/* Forward badge — shown when the post is a repost from another channel */}
          {item.forwardFromName && (
            <div
              className={styles.forwardBadge}
              title={t('news.detail.forwarded_from', { name: item.forwardFromName })}
            >
              <RetweetOutlined />
              <span className={styles.forwardName}>{item.forwardFromName}</span>
            </div>
          )}

          {/* Zone 2: post text infoblock */}
          {showTextBlock && <NewsTextBlock text={item.text} />}

          {/* Load article button — below the text card, centered */}
          {showLoadBtn && (
            <div className={styles.loadBtnWrap}>
              <Button
                icon={articleLoading ? ICON_LOADING : ICON_DOWNLOAD}
                onClick={onExtractClick}
                loading={articleLoading}
                disabled={articleQueued}
              >
                {articleQueued ? t('news.detail.queued') : t('news.detail.load_article')}
              </Button>
              {articleTaskStatus === 'failed' && (
                <Text type="danger" className={styles.errorText}>
                  {t('news.detail.error', { error: articleTaskError })}
                </Text>
              )}
            </div>
          )}

          {/* Zone 3: full article */}
          {articleContent && item.canLoadArticle === 1 && (
            <NewsArticleBody content={articleContent} format={articleFormat} />
          )}

          {item.canLoadArticle !== 1 && articleContent && (
            <>
              <Divider>
                <Text type="secondary" className={styles.dividerLabel}>
                  {t('news.detail.full_content_divider')}
                </Text>
              </Divider>
              <NewsArticleBody content={articleContent} format={articleFormat} />
            </>
          )}

          <NewsYouTubeEmbeds links={links} />
        </div>
      </div>

      <Modal
        open={linkModalOpen}
        title={t('news.detail.select_link_title')}
        okText={t('common.download')}
        cancelText={t('common.cancel')}
        onOk={onModalConfirm}
        onCancel={onModalCancel}
      >
        <Radio.Group value={selectedUrl} onChange={handleUrlChange} className={styles.radioGroup}>
          {links
            .filter((l) => !isYouTubeUrl(l))
            .map((link) => (
              <Radio key={link} value={link}>
                <Text className={styles.radioLink}>{link.length > 70 ? link.substring(0, 70) + '…' : link}</Text>
              </Radio>
            ))}
        </Radio.Group>
      </Modal>
    </>
  );
}
