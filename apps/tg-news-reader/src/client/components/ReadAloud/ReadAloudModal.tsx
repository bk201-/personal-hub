import { RobotOutlined, SoundOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Tooltip, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTtsConfig } from '../../api/tts';
import { useUIStore } from '../../store/uiStore';
import { AiPlayer } from './AiPlayer';
import { NativePlayer } from './NativePlayer';
import { sanitizeForTts } from './sanitizeForTts';
import { splitSentences } from './splitSentences';
import { isNativeTtsSupported } from './useNativeTts';
import { VoicePicker } from './VoicePicker';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  meta: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
    margin-bottom: 16px;
  `,
  choiceRow: css`
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
  `,
  choiceButton: css`
    flex: 1 1 0;
    min-width: 160px;
    height: 56px;
  `,
}));

const ICON_NATIVE = <SoundOutlined />;
const ICON_AI = <RobotOutlined />;

export interface ReadAloudModalProps {
  open: boolean;
  onClose: () => void;
  text: string;
  title?: string;
}

type ModalMode = 'choice' | 'native' | 'ai';

export function ReadAloudModal({ open, onClose, text, title }: ReadAloudModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const [mode, setMode] = useState<ModalMode>('choice');

  // Reset state whenever the modal closes
  useEffect(() => {
    if (!open) setMode('choice');
  }, [open]);

  const ttsConfig = useTtsConfig();
  const aiEnabled = ttsConfig.data?.enabled === true;
  const aiDefaultVoice = ttsConfig.data?.defaultVoice ?? 'nova';
  const aiVoices = ttsConfig.data?.voices ?? [];
  const aiMaxChars = ttsConfig.data?.maxInputChars ?? 20_000;

  // Persisted last-used voice; falls back to server default. If the persisted value is
  // no longer in the server's voices list (e.g. model changed), we drop back to default.
  const persistedVoice = useUIStore((s) => s.ttsVoice);
  const setPersistedVoice = useUIStore((s) => s.setTtsVoice);
  const selectedVoice = persistedVoice && aiVoices.includes(persistedVoice) ? persistedVoice : aiDefaultVoice;

  const nativeSupported = isNativeTtsSupported();
  // Strip URLs/markdown links once at the modal level — both Native and AI players use the
  // sanitized copy. The char count shown to the user reflects the sanitized length too
  // (so the displayed number matches what actually gets billed by the AI provider).
  const sanitized = useMemo(() => sanitizeForTts(text), [text]);
  const hasContent = !!sanitized.trim();
  // Cheap O(n) check to decide whether to enable the Native button — actual sentence
  // playback happens inside <NativePlayer> only after the user picks Native.
  const sentencesNonEmpty = useMemo(() => hasContent && splitSentences(sanitized).length > 0, [sanitized, hasContent]);
  const aiTooLong = sanitized.length > aiMaxChars;

  const modalTitle = title ? `${t('tts.modal_title')} — ${title}` : t('tts.modal_title');

  const handleStop = useCallback(() => setMode('choice'), []);
  const handlePickNative = useCallback(() => setMode('native'), []);
  const handlePickAi = useCallback(() => setMode('ai'), []);

  const aiTooltip = !aiEnabled ? t('tts.ai_unavailable') : aiTooLong ? t('tts.ai_too_long') : '';

  return (
    <Modal title={modalTitle} open={open} onCancel={onClose} footer={null} destroyOnHidden width={520}>
      <div className={styles.meta}>
        <Text type="secondary">{t('tts.char_count', { count: sanitized.length })}</Text>
      </div>

      {mode === 'choice' && (
        <>
          {!nativeSupported && <Alert type="warning" title={t('tts.native_unsupported')} showIcon />}
          {nativeSupported && !sentencesNonEmpty && <Alert type="warning" title={t('tts.empty_text')} showIcon />}
          <div className={styles.choiceRow}>
            <Button
              className={styles.choiceButton}
              icon={ICON_NATIVE}
              onClick={handlePickNative}
              disabled={!nativeSupported || !sentencesNonEmpty}
              size="large"
            >
              {t('tts.choice_native')}
            </Button>
            <Tooltip title={aiTooltip}>
              <Button
                className={styles.choiceButton}
                icon={ICON_AI}
                onClick={handlePickAi}
                disabled={!aiEnabled || !hasContent || aiTooLong}
                size="large"
                type={aiEnabled && hasContent && !aiTooLong ? 'primary' : 'default'}
              >
                {t('tts.choice_ai')}
              </Button>
            </Tooltip>
          </div>
          {aiEnabled && aiVoices.length > 0 && (
            <VoicePicker
              voices={aiVoices}
              value={selectedVoice}
              onChange={setPersistedVoice}
              disabled={!hasContent || aiTooLong}
            />
          )}
        </>
      )}

      {mode === 'native' && <NativePlayer text={sanitized} onStop={handleStop} />}
      {mode === 'ai' && <AiPlayer text={sanitized} defaultVoice={selectedVoice} onStop={handleStop} />}
    </Modal>
  );
}
