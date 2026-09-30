import {
  CaretRightOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Progress, Tooltip } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { splitSentences } from './splitSentences';
import { useNativeTts } from './useNativeTts';

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  controls: css`
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  `,
  position: css`
    text-align: center;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  stopRow: css`
    display: flex;
    justify-content: flex-end;
  `,
}));

const ICON_PLAY = <CaretRightOutlined />;
const ICON_PAUSE = <PauseOutlined />;
const ICON_PREV = <StepBackwardOutlined />;
const ICON_NEXT = <StepForwardOutlined />;
const ICON_STOP = <StopOutlined />;

export interface NativePlayerProps {
  text: string;
  onStop: () => void;
}

/**
 * Native (Web Speech API) player. Uses sentence-based seek as a workaround for the
 * fact that speechSynthesis does not expose time-based progress.
 */
export function NativePlayer({ text, onStop }: NativePlayerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const sentences = useMemo(() => splitSentences(text), [text]);
  const tts = useNativeTts(sentences);

  // Autostart on mount
  useEffect(() => {
    tts.start(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayPause = useCallback(() => {
    if (tts.status === 'playing') tts.pause();
    else if (tts.status === 'paused') tts.resume();
    else tts.start(tts.currentIndex);
  }, [tts]);

  const handleStop = useCallback(() => {
    tts.stop();
    onStop();
  }, [tts, onStop]);

  const progressPct =
    tts.total > 0 ? Math.round(((Math.min(tts.currentIndex, tts.total - 1) + 1) / tts.total) * 100) : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <Tooltip title={t('tts.prev_tooltip')}>
          <Button
            icon={ICON_PREV}
            shape="circle"
            onClick={tts.prev}
            disabled={tts.currentIndex <= 0}
            aria-label={t('tts.prev_tooltip')}
          />
        </Tooltip>
        <Tooltip title={tts.status === 'playing' ? t('tts.pause_tooltip') : t('tts.play_tooltip')}>
          <Button
            icon={tts.status === 'playing' ? ICON_PAUSE : ICON_PLAY}
            shape="circle"
            size="large"
            type="primary"
            onClick={handlePlayPause}
            aria-label={tts.status === 'playing' ? t('tts.pause_tooltip') : t('tts.play_tooltip')}
          />
        </Tooltip>
        <Tooltip title={t('tts.next_tooltip')}>
          <Button
            icon={ICON_NEXT}
            shape="circle"
            onClick={tts.next}
            disabled={tts.currentIndex >= tts.total - 1}
            aria-label={t('tts.next_tooltip')}
          />
        </Tooltip>
      </div>

      <Progress percent={progressPct} showInfo={false} />

      <div className={styles.position}>
        {t('tts.position', { current: Math.min(tts.currentIndex + 1, tts.total), total: tts.total })}
      </div>

      <div className={styles.stopRow}>
        <Button icon={ICON_STOP} onClick={handleStop} size="small">
          {t('tts.stop')}
        </Button>
      </div>
    </div>
  );
}
