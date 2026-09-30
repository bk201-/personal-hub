import { FileOutlined, PictureOutlined, PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { Checkbox, Typography } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../../api/channels';
import { useMarkRead } from '../../../api/news';
import type { NewsFilterMode } from '../../../store/uiStore';
import { useUIStore } from '../../../store/uiStore';
import { NewsHashtags } from './NewsHashtags';

const { Text } = Typography;

const EMPTY_HASHTAGS: string[] = [];

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    padding: 10px 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    cursor: pointer;
    transition: background 0.12s;
    &:hover {
      background: ${token.colorFillQuaternary};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
  `,
  itemSelected: css`
    background: ${token.colorPrimaryBg};
    border-left: 3px solid ${token.colorPrimary};
  `,
  itemRead: css``,
  itemDimmed: css`
    opacity: 0.45;
  `,
  header: css`
    display: flex;
    align-items: flex-start;
    gap: 6px;
  `,
  checkbox: css`
    flex-shrink: 0;
  `,
  titleWrap: css`
    flex: 1;
    margin-left: 8px;
  `,
  titleDimmed: css`
    opacity: 0.4;
  `,
  title: css`
    font-size: 13px;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `,
  titleRead: css`
    color: ${token.colorTextDisabled} !important;
  `,
  meta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding-left: 24px;
  `,
  metaDate: css`
    font-size: 11px;
    flex-shrink: 0;
    white-space: nowrap;
  `,
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-end;
  `,
  thumb: css`
    flex-shrink: 0;
    margin-left: 8px;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    align-self: center;
    cursor: pointer;
    &:hover {
      opacity: 0.85;
    }
  `,
  thumbDimmed: css`
    opacity: 0.4;
  `,
  thumbPlaceholder: css`
    width: 100%;
    height: 100%;
    background: ${token.colorFillSecondary};
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  photoIcon: css`
    font-size: 20px;
    color: ${token.colorTextTertiary};
  `,
  fileIcon: css`
    font-size: 20px;
    color: ${token.colorTextTertiary};
  `,
  thumbVideo: css`
    width: 100%;
    height: 100%;
    background: #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  thumbAudio: css`
    width: 100%;
    height: 100%;
    background: ${token.colorFillSecondary};
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  videoIcon: css`
    font-size: 22px;
    color: ${token.colorTextLightSolid};
  `,
  audioIcon: css`
    font-size: 20px;
    color: ${token.colorPrimary};
  `,
  thumbPhoto: css`
    position: relative;
    width: 100%;
    height: 100%;
  `,
  overflowTag: css`
    font-size: 10px;
  `,
  albumBadge: css`
    position: absolute;
    bottom: 2px;
    right: 2px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 14px;
    pointer-events: none;
  `,
}));

interface NewsListItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean; // true = passed filter, false = filtered out
  newsFilterMode: NewsFilterMode;
  onClick: (id: number) => void;
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
}

function getTitle(item: NewsItem, fallback: string): string {
  const text = item.text || '';
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine.length > 80 ? firstLine.substring(0, 80) + '…' : firstLine || fallback;
}

export const NewsListItem = memo(
  function NewsListItem({ item, isSelected, isFiltered, newsFilterMode, onClick, onTagClick }: NewsListItemProps) {
    const markRead = useMarkRead();
    const { styles, cx } = useStyles();
    const { t } = useTranslation();
    const openLightbox = useUIStore((s) => s.openLightbox);
    const { data: channels } = useChannels();
    const channelType = channels?.find((ch) => ch.id === item.channelId)?.channelType;

    const title = getTitle(item, t('news.list.message_fallback', { id: item.telegramMsgId }));
    const hashtags = item.hashtags ?? EMPTY_HASHTAGS;
    const isRead = item.isRead === 1;
    const firstMediaPath = item.localMediaPaths?.[0] ?? item.localMediaPath;
    const hasFile = !!firstMediaPath;
    const isAlbum = (item.localMediaPaths?.length ?? 0) > 1;

    // Media-type icon is derived from item.mediaType so it shows immediately,
    // before the actual file downloads. Video: the server tags new rows as
    // 'video'; legacy rows still say 'document', so fall back to the file
    // extension once the file exists.
    const mt = item.mediaType;
    const isVideo = mt === 'video' || /\.(mp4|webm|mov)$/i.test(firstMediaPath ?? '');
    const isAudio = mt === 'audio';
    const isDocument = mt === 'document' && !isVideo;
    const isPhoto = mt === 'photo';

    // News channels get lots of decorative photos that say little as a thumbnail —
    // suppress the photo icon there until the file is actually downloaded.
    // Blogs and media channels always show the type icon immediately.
    const isNewsChannel = channelType === 'news' || channelType === 'news_link';
    const showPhoto = isPhoto ? !isNewsChannel || hasFile : false;

    const thumbKind: 'video' | 'audio' | 'document' | 'photo' | null = isVideo
      ? 'video'
      : isAudio
        ? 'audio'
        : isDocument
          ? 'document'
          : showPhoto
            ? 'photo'
            : // Legacy fallback: a downloaded file with no/unknown media type.
              hasFile && mt !== 'webpage'
              ? 'photo'
              : null;

    const handleMarkRead = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        markRead.mutate({ id: item.id, isRead: isRead ? 0 : 1, channelId: item.channelId });
      },
      [markRead, item.id, item.channelId, isRead],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onClick(item.id);
        }
      },
      [onClick, item.id],
    );

    const handleClick = useCallback(() => onClick(item.id), [onClick, item.id]);

    const ellipsisConfig = useMemo(() => ({ tooltip: title }), [title]);

    const handleThumbClick = useCallback(
      (e: React.MouseEvent) => {
        if (item.mediaType === 'photo' || item.mediaType === 'document' || item.mediaType === 'video') {
          e.stopPropagation();
          openLightbox(item.id, 0, item.channelId);
        }
      },
      [item.mediaType, item.id, item.channelId, openLightbox],
    );

    // Render rules per mode:
    //   'filtered' — hide items rejected by filters (isFiltered=false)
    //   'all'      — render everything; dim rejected ones
    //   'hidden'   — render everything (server returned only rejected items); no dimming
    if (newsFilterMode === 'filtered' && !isFiltered) return null;

    const dimmed = newsFilterMode === 'all' && !isFiltered;

    return (
      <div
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
        data-news-id={item.id}
        className={cx(
          styles.item,
          isSelected && styles.itemSelected,
          isRead && styles.itemRead,
          dimmed && styles.itemDimmed,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <Checkbox checked={isRead} onClick={handleMarkRead} className={styles.checkbox} />
          <Text
            className={cx(styles.title, styles.titleWrap, isRead && styles.titleRead, dimmed && styles.titleDimmed)}
            strong={!isRead}
            ellipsis={ellipsisConfig}
          >
            {title}
          </Text>
          {thumbKind && (
            <div className={cx(styles.thumb, dimmed && styles.thumbDimmed)} onClick={handleThumbClick}>
              {thumbKind === 'audio' ? (
                <div className={styles.thumbAudio}>
                  <SoundOutlined className={styles.audioIcon} />
                </div>
              ) : thumbKind === 'video' ? (
                <div className={styles.thumbVideo}>
                  <PlayCircleOutlined className={styles.videoIcon} />
                </div>
              ) : (
                <div className={styles.thumbPhoto}>
                  <div className={styles.thumbPlaceholder}>
                    {thumbKind === 'document' ? (
                      <FileOutlined className={styles.fileIcon} />
                    ) : (
                      <PictureOutlined className={styles.photoIcon} />
                    )}
                  </div>
                  {isAlbum && <span className={styles.albumBadge}>{item.localMediaPaths!.length}</span>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={styles.meta}>
          <Text type="secondary" className={styles.metaDate}>
            {dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm')}
          </Text>
          <NewsHashtags hashtags={hashtags} onTagClick={onTagClick} maxVisible={4} className={styles.tags} />
        </div>
      </div>
    );
  },
  // Custom comparator: skip onClick/onTagClick — they're always recreated but
  // functionally stable (close over stable Zustand setters). Only re-render when
  // the actual item data or display-affecting booleans change.
  (prev, next) =>
    prev.item === next.item &&
    prev.isSelected === next.isSelected &&
    prev.isFiltered === next.isFiltered &&
    prev.showAll === next.showAll,
);
