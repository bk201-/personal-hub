import { CloseOutlined, LinkOutlined, LoadingOutlined, RetweetOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { Button, Typography } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaUrl } from '../../../api/mediaUrl';
import { LightboxVideoControls } from './LightboxVideoControls';

const ICON_LINK = <LinkOutlined />;
const ICON_CLOSE = <CloseOutlined />;
const ICON_LOADING = <LoadingOutlined />;
const ICON_SHARE = <ShareAltOutlined />;
const ICON_RETWEET = <RetweetOutlined />;

interface LightboxToolbarProps {
  item: NewsItem | null | undefined;
  channelName: string;
  channelTelegramId: string;
  positionLabel: string;
  /** Current displayed media path (used for native file sharing) */
  currentMediaPath?: string;
  onClose: () => void;
  onRotate?: (direction: -1 | 1) => void;
}

const useStyles = createStyles(({ css }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.75) 0%, transparent 100%);
    flex-shrink: 0;
    z-index: 2;
  `,
  info: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  channel: css`
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  meta: css`
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  `,
  forwardTag: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  closeBtn: css`
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.85) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    &:hover {
      background: rgba(255, 255, 255, 0.18) !important;
    }
  `,
  linkBtn: css`
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.65) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
    background: rgba(255, 255, 255, 0.05) !important;
    &:hover {
      color: rgba(255, 255, 255, 0.9) !important;
      background: rgba(255, 255, 255, 0.15) !important;
    }
  `,
}));

const { Text } = Typography;

export function LightboxToolbar({
  item,
  channelName,
  channelTelegramId,
  positionLabel,
  currentMediaPath,
  onClose,
  onRotate,
}: LightboxToolbarProps) {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);

  const openUrl = item ? (item.links?.[0] ?? `https://t.me/${channelTelegramId}/${item.telegramMsgId}`) : undefined;
  // shareUrl: always the Telegram message permalink (not an external website)
  const shareUrl = item ? `https://t.me/${channelTelegramId}/${item.telegramMsgId}` : undefined;

  const date = item ? dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm') : '';

  const canShare = 'share' in navigator;

  const handleShare = useCallback(async () => {
    if (!currentMediaPath) return;
    setSharing(true);
    try {
      const url = mediaUrl(currentMediaPath);
      const filename = currentMediaPath.split('/').pop() ?? 'media';

      if (navigator.canShare) {
        // Fetch file and try native file share
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }

      // Fallback: share the Telegram post URL
      if (shareUrl) {
        await navigator.share({ url: shareUrl, title: channelName });
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet — not an error
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[LightboxToolbar] share failed:', err);
      }
    } finally {
      setSharing(false);
    }
  }, [currentMediaPath, shareUrl, channelName]);

  const handleShareVoid = useCallback(() => void handleShare(), [handleShare]);
  const handleOpenUrl = useCallback(() => window.open(openUrl, '_blank', 'noopener,noreferrer'), [openUrl]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.info}>
        <span className={styles.channel}>{channelName}</span>
        <div className={styles.meta}>
          <Text>{date}</Text>
          {positionLabel && <Text>· {positionLabel}</Text>}
          {item?.forwardFromName && (
            <span className={styles.forwardTag} title={t('news.detail.forwarded_from', { name: item.forwardFromName })}>
              {ICON_RETWEET}
              {item.forwardFromName}
            </span>
          )}
        </div>
      </div>

      {onRotate && <LightboxVideoControls className={styles.linkBtn} onRotate={onRotate} />}
      {canShare && currentMediaPath && (
        <Button
          size="small"
          icon={sharing ? ICON_LOADING : ICON_SHARE}
          className={styles.linkBtn}
          onClick={handleShareVoid}
          disabled={sharing}
          title={t('lightbox.share')}
        />
      )}

      {openUrl && (
        <Button
          size="small"
          icon={ICON_LINK}
          className={styles.linkBtn}
          onClick={handleOpenUrl}
          title={t('lightbox.open_in_telegram')}
        />
      )}

      <Button
        size="small"
        icon={ICON_CLOSE}
        className={styles.closeBtn}
        onClick={onClose}
        title={t('lightbox.close')}
      />
    </div>
  );
}
