import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button, Progress, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGenerateTts, useTtsAudioUrl, useTtsStatus } from '../../api/tts';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  loading: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: ${token.colorFillTertiary};
    border-radius: ${token.borderRadius}px;
  `,
  loadingText: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  audio: css`
    width: 100%;
  `,
  progress: css`
    flex: 1;
  `,
  footerRow: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,
  poweredBy: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
  `,
  position: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
    text-align: center;
  `,
  actions: css`
    display: flex;
    gap: 8px;
  `,
}));

const ICON_STOP = <StopOutlined />;
const ICON_RETRY = <ReloadOutlined />;

export interface AiPlayerProps {
  text: string;
  defaultVoice: string;
  /** Returns to the choice screen and tears down audio + generation. */
  onStop: () => void;
}

/**
 * AI player — kicks off OpenAI TTS generation and plays the resulting MP3 chunks with
 * a native `<audio>` element so the user gets full seek/scrubbing/playback-rate controls.
 *
 * Chunk playlist: chunks are stored as separate MP3 files on the server
 * (`/api/tts/:hash/:idx.mp3`). When one chunk ends, we advance to the next by swapping
 * `src` and calling `play()`. We deliberately avoid byte-level MP3 concatenation server-side
 * because each chunk has its own ID3v2 header, which confuses browser players' timelines
 * (audio appears to "restart" at every chunk boundary).
 *
 * Flow:
 *   1. mount → POST /api/tts → server returns hash (cached=true on hit, false otherwise)
 *   2. when cached=false → poll /status until status=done
 *   3. swap loading spinner for <audio src=ttsAudioUrl(hash, 0) controls autoPlay>
 *   4. on `ended` → if more chunks remain, advance idx, swap src, play
 *   5. on error → show alert + retry button
 */
export function AiPlayer({ text, defaultVoice, onStop }: AiPlayerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const [hash, setHash] = useState<string | null>(null);
  const [chunkIdx, setChunkIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateMutation = useGenerateTts();
  const statusQuery = useTtsStatus(hash);
  const audioUrl = useTtsAudioUrl(hash, chunkIdx);

  const chunksTotal = statusQuery.data?.chunksTotal ?? 0;

  // Kick off generation exactly once on mount
  const kickedOffRef = useRef(false);
  const triggerGeneration = useCallback(() => {
    generateMutation.mutate(
      { text, voice: defaultVoice },
      {
        onSuccess: (data) => setHash(data.hash),
      },
    );
  }, [generateMutation, text, defaultVoice]);

  useEffect(() => {
    if (kickedOffRef.current) return;
    kickedOffRef.current = true;
    triggerGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When chunk index changes (advance to next chunk), load the new src and play it.
  // We `load()` explicitly so the browser drops any buffered data from the previous chunk.
  useEffect(() => {
    if (!audioUrl) return;
    const el = audioRef.current;
    if (!el) return;
    // Reload + autoplay for chunks after the first; chunk 0 uses the element's `autoPlay`
    // attribute on initial mount.
    if (chunkIdx > 0) {
      el.load();
      el.play().catch(() => {
        // Autoplay may be blocked if the tab lost focus — leave the controls visible
        // so the user can press play manually.
      });
    }
  }, [audioUrl, chunkIdx]);

  // Pause audio on unmount so it doesn't outlive the modal
  useEffect(() => {
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const el = audioRef.current;
      if (el && !el.paused) el.pause();
    };
  }, []);

  const handleStop = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    onStop();
  }, [onStop]);

  const handleRetry = useCallback(() => {
    setHash(null);
    setChunkIdx(0);
    kickedOffRef.current = false;
    generateMutation.reset();
    statusQuery.refetch().catch(() => {});
    triggerGeneration();
    kickedOffRef.current = true;
  }, [generateMutation, statusQuery, triggerGeneration]);

  const handleEnded = useCallback(() => {
    // Advance to the next chunk in the playlist; do nothing on the last chunk.
    setChunkIdx((idx) => (idx + 1 < chunksTotal ? idx + 1 : idx));
  }, [chunksTotal]);

  // Only render the chunk-position indicator when there's more than one chunk.
  const showPosition = chunksTotal > 1;

  // ── Render branches ──
  const generateError = generateMutation.error;
  if (generateError) {
    const isUnavailable = generateError.status === 503;
    const isTooLong = generateError.status === 413;
    const msg = isUnavailable
      ? t('tts.ai_unavailable')
      : isTooLong
        ? t('tts.ai_too_long')
        : generateError.message || t('tts.ai_failed');
    return (
      <div className={styles.wrap}>
        <Alert type="error" title={msg} showIcon />
        <div className={styles.actions}>
          {!isUnavailable && !isTooLong && (
            <Button icon={ICON_RETRY} onClick={handleRetry}>
              {t('tts.ai_retry')}
            </Button>
          )}
          <Button icon={ICON_STOP} onClick={onStop}>
            {t('tts.stop')}
          </Button>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;
  const isReady = status?.status === 'done' && audioUrl;
  const isFailed = status?.status === 'failed';
  const isGenerating = !isReady && !isFailed;

  if (isFailed) {
    return (
      <div className={styles.wrap}>
        <Alert type="error" title={status?.error ?? t('tts.ai_failed')} showIcon />
        <div className={styles.actions}>
          <Button icon={ICON_RETRY} onClick={handleRetry}>
            {t('tts.ai_retry')}
          </Button>
          <Button icon={ICON_STOP} onClick={onStop}>
            {t('tts.stop')}
          </Button>
        </div>
      </div>
    );
  }

  // (`showPosition` was hoisted above the early returns to keep hook order stable)
  return (
    <div className={styles.wrap}>
      {isGenerating && (
        <div className={styles.loading}>
          <Spin size="small" />
          <Text className={styles.loadingText}>
            {status && status.chunksTotal > 1
              ? t('tts.ai_generating_progress', {
                  done: status.chunksDone,
                  total: status.chunksTotal,
                })
              : t('tts.ai_generating')}
          </Text>
          {status && status.chunksTotal > 1 && (
            <Progress
              percent={Math.round((status.chunksDone / status.chunksTotal) * 100)}
              showInfo={false}
              size="small"
              className={styles.progress}
            />
          )}
        </div>
      )}

      {isReady && (
        <audio
          ref={audioRef}
          className={styles.audio}
          src={audioUrl ?? undefined}
          controls
          autoPlay
          onEnded={handleEnded}
        />
      )}

      {isReady && showPosition && (
        <div className={styles.position}>
          {t('tts.ai_chunk_position', { current: chunkIdx + 1, total: chunksTotal })}
        </div>
      )}

      <div className={styles.footerRow}>
        <span className={styles.poweredBy}>{t('tts.ai_powered_by')}</span>
        <Button icon={ICON_STOP} onClick={handleStop} size="small">
          {t('tts.stop')}
        </Button>
      </div>
    </div>
  );
}
