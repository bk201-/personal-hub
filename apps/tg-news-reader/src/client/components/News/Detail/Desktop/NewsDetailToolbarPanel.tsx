import {
  CheckOutlined,
  DownloadOutlined,
  ExportOutlined,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  ReloadOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { Button, Space } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../../../common/MaybeTooltip';
import { ReadAloudButton } from '../../../ReadAloud/ReadAloudButton';
import { NewsHashtags } from '../../Feed/NewsHashtags';
import { getNewsTitle, isYouTubeUrl } from '../../newsUtils';
import type { NewsDetailToolbarProps } from '../newsDetailToolbarTypes';

const ICON_RELOAD = <ReloadOutlined />;
const ICON_LINK = <LinkOutlined />;
const ICON_FILE_TEXT = <FileTextOutlined />;
const ICON_LOADING = <LoadingOutlined />;
const ICON_DOWNLOAD = <DownloadOutlined />;
const ICON_EXPORT = <ExportOutlined />;
const ICON_SHARE = <ShareAltOutlined />;
const ICON_CHECK = <CheckOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  headerTop: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 12px 20px;
  `,
  dateLine: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  tags: css`
    margin-top: 4px;
  `,
  /* Hides button text labels when the detail header gets narrow (container set on header in NewsDetail) */
  ndBtnText: css`
    @container (max-width: 540px) {
      display: none;
    }
  `,
}));

export function NewsDetailToolbarPanel({
  item,
  links,
  topPanel,
  onTogglePanel,
  articleLoading,
  articleQueued,
  onExtractClick,
  isRead,
  onMarkRead,
  markReadPending,
  onRefresh,
  refreshPending,
  openUrl,
  isExternalLink,
  onTagClick,
  onShare,
}: NewsDetailToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const hashtags = useMemo(() => item.hashtags || [], [item.hashtags]);
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));

  const handleToggleLinks = useCallback(() => onTogglePanel('links'), [onTogglePanel]);
  const handleToggleText = useCallback(() => onTogglePanel('text'), [onTogglePanel]);

  const metaContent = (
    <>
      <span className={styles.dateLine}>{dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}</span>
      {hashtags.length > 0 && <NewsHashtags hashtags={hashtags} onTagClick={onTagClick} className={styles.tags} />}
    </>
  );

  return (
    <div className={styles.headerTop}>
      <div>{metaContent}</div>

      <Space wrap size={4}>
        <Tooltip title={t('news.detail.refresh_tooltip')}>
          <Button icon={ICON_RELOAD} size="small" onClick={onRefresh} loading={refreshPending}>
            <span className={styles.ndBtnText}>{t('news.detail.refresh')}</span>
          </Button>
        </Tooltip>

        {links.length > 0 && (
          <Tooltip title={t('news.detail.links_tooltip')}>
            <Button
              icon={ICON_LINK}
              size="small"
              type={topPanel === 'links' ? 'primary' : 'default'}
              onClick={handleToggleLinks}
            >
              <span className={styles.ndBtnText}>
                {links.length > 1 ? t('news.detail.links_count', { count: links.length }) : t('news.detail.links')}
              </span>
            </Button>
          </Tooltip>
        )}
        {item.text && (
          <Tooltip title={t('news.detail.text_tooltip')}>
            <Button
              icon={ICON_FILE_TEXT}
              size="small"
              type={topPanel === 'text' ? 'primary' : 'default'}
              onClick={handleToggleText}
            >
              <span className={styles.ndBtnText}>{t('news.detail.text')}</span>
            </Button>
          </Tooltip>
        )}

        {item.canLoadArticle === 1 && !item.fullContent && nonYtLinks.length > 0 && (
          <Tooltip title={t('news.detail.load_article_tooltip')}>
            <Button
              icon={articleLoading ? ICON_LOADING : ICON_DOWNLOAD}
              size="small"
              onClick={onExtractClick}
              loading={articleLoading}
              disabled={articleQueued}
            >
              <span className={styles.ndBtnText}>
                {articleQueued ? t('news.detail.queued') : t('news.detail.load_article')}
              </span>
            </Button>
          </Tooltip>
        )}

        <Tooltip title={isExternalLink ? t('news.detail.open_tooltip') : t('news.detail.open_tg_tooltip')}>
          <Button icon={ICON_EXPORT} size="small" href={openUrl} target="_blank" rel="noreferrer">
            <span className={styles.ndBtnText}>{t('news.detail.open')}</span>
          </Button>
        </Tooltip>
        <Tooltip title={t('news.detail.share_tooltip')}>
          <Button icon={ICON_SHARE} size="small" onClick={onShare}>
            <span className={styles.ndBtnText}>{t('news.detail.share')}</span>
          </Button>
        </Tooltip>
        <ReadAloudButton
          text={item.fullContent || item.text || ''}
          title={getNewsTitle(item).slice(0, 60)}
          labelClassName={styles.ndBtnText}
        />
        <Button
          icon={ICON_CHECK}
          size="small"
          type={isRead ? 'default' : 'primary'}
          onClick={onMarkRead}
          loading={markReadPending}
        >
          <span className={styles.ndBtnText}>{isRead ? t('news.detail.mark_unread') : t('news.detail.mark_read')}</span>
        </Button>
      </Space>
    </div>
  );
}
