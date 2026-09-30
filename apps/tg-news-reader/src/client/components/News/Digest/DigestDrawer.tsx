import { CloseOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, message, Progress, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { streamDigest } from '../../../api/digest';
import type { DigestParams } from '../../../api/digest';
import { useUIStore } from '../../../store/uiStore';
import { ReadAloudButton } from '../../ReadAloud/ReadAloudButton';
import { DigestBody } from './DigestBody';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    padding: 16px 20px;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  spinner: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorTextSecondary};
  `,
  prefetchWrap: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 0 8px;
  `,
  prefetchLabel: css`
    font-size: 13px;
    color: ${token.colorTextSecondary};
  `,
  prefetchError: css`
    font-size: 12px;
    color: ${token.colorError};
  `,
  footer: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 0;
    border-top: 1px solid ${token.colorBorderSecondary};
    flex-shrink: 0;
  `,
  poweredBy: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  footerActions: css`
    display: flex;
    gap: 8px;
  `,
}));

const ICON_CLOSE = <CloseOutlined />;
const ICON_RELOAD = <ReloadOutlined />;
const ICON_COPY = <CopyOutlined />;
const DRAWER_BODY_STYLES = { body: { padding: 0 } };

interface DigestDrawerProps {
  open: boolean;
  params: DigestParams;
  onClose: () => void;
  /**
   * Pre-loaded digest content (e.g. from a cached batch result).
   * When provided, the drawer skips auto-streaming and renders this immediately.
   * The user can still click "Refresh" to re-generate.
   */
  initialText?: string;
  initialRefMap?: Record<number, number>;
}

export function DigestDrawer({ open, params, onClose, initialText, initialRefMap }: DigestDrawerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const [text, setText] = useState(initialText ?? '');
  const [refMap, setRefMap] = useState<Record<number, number>>(initialRefMap ?? {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefetchProgress, setPrefetchProgress] = useState<{
    done: number;
    total: number;
    errors: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generatedParamsRef = useRef<string>(initialText ? JSON.stringify(params) : '');
  const { setSelectedNewsId } = useUIStore();

  const paramsKey = JSON.stringify(params);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setRefMap({});
    setError(null);
    setPrefetchProgress(null);
    setLoading(true);

    try {
      for await (const event of streamDigest(params, ctrl.signal)) {
        if (event.type === 'chunk') {
          setPrefetchProgress(null); // clear circle on first chunk
          setText((prev) => prev + event.content);
        } else if (event.type === 'ref_map') {
          setRefMap(event.map);
        } else if (event.type === 'prefetch_progress') {
          setPrefetchProgress({ done: event.done, total: event.total, errors: event.errors });
        }
      }
      generatedParamsRef.current = paramsKey;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? t('digest.error_generic'));
    } finally {
      setLoading(false);
    }
  }, [params, paramsKey, t]);

  // Reset content when params change (e.g. different channel selected)
  useEffect(() => {
    if (generatedParamsRef.current && generatedParamsRef.current !== paramsKey) {
      abortRef.current?.abort();
      setText('');
      setRefMap({});
      setError(null);
      setPrefetchProgress(null);
      setLoading(false);
      generatedParamsRef.current = '';
    }
  }, [paramsKey]);

  // Auto-run only on first open when there's no content yet
  useEffect(() => {
    if (open && !text && !loading && !error) {
      void run();
    }
  }, [open, paramsKey, text, loading, error, run]);

  // Abort on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleRefClick = useCallback(
    (newsId: number) => {
      setSelectedNewsId(newsId);
    },
    [setSelectedNewsId],
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    void message.success(t('digest.copied'));
  }, [text, t]);

  const handleRunVoid = useCallback(() => void run(), [run]);
  const handleCopyVoid = useCallback(() => void handleCopy(), [handleCopy]);

  const isPrefetching = loading && prefetchProgress !== null;

  return (
    <Drawer
      title={t('digest.title')}
      placement="right"
      size="large"
      open={open}
      onClose={onClose}
      closeIcon={ICON_CLOSE}
      mask={false}
      styles={DRAWER_BODY_STYLES}
    >
      <div className={styles.body}>
        {error && <Alert type="error" title={error} showIcon />}

        {isPrefetching && (
          <div className={styles.prefetchWrap}>
            <Progress
              type="circle"
              size={80}
              percent={Math.round(((prefetchProgress.done + prefetchProgress.errors) / prefetchProgress.total) * 100)}
            />
            <Text className={styles.prefetchLabel}>
              {t('digest.prefetching', {
                done: prefetchProgress.done,
                total: prefetchProgress.total,
              })}
            </Text>
            {prefetchProgress.errors > 0 && (
              <Text className={styles.prefetchError}>
                {t('digest.prefetching_errors', { errors: prefetchProgress.errors })}
              </Text>
            )}
          </div>
        )}

        {loading && !isPrefetching && (
          <div className={styles.spinner}>
            <Spin size="small" />
            <Text type="secondary">{t('digest.generating')}</Text>
          </div>
        )}

        {text && <DigestBody text={text} refMap={refMap} onRefClick={handleRefClick} />}

        {!loading && !text && !error && <Text type="secondary">{t('digest.empty')}</Text>}

        {text && !loading && (
          <div className={styles.footer}>
            <span className={styles.poweredBy}>{t('digest.powered_by')}</span>
            <div className={styles.footerActions}>
              <ReadAloudButton text={text} title={t('digest.title')} />
              <Button icon={ICON_RELOAD} size="small" onClick={handleRunVoid}>
                {t('digest.refresh')}
              </Button>
              <Button icon={ICON_COPY} size="small" onClick={handleCopyVoid}>
                {t('digest.copy')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
