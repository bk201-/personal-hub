import { Select, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 10px 12px;
    background: ${token.colorFillTertiary};
    border-radius: ${token.borderRadius}px;
  `,
  label: css`
    font-size: 13px;
    color: ${token.colorTextSecondary};
    white-space: nowrap;
  `,
  select: css`
    flex: 1;
    min-width: 160px;
  `,
}));

export interface VoicePickerProps {
  voices: string[];
  value: string;
  onChange: (voice: string) => void;
  disabled?: boolean;
}

/**
 * Compact voice selector for the AI TTS mode. Shows the voice list returned by the
 * server (`/api/tts/config`) and persists the choice via the caller (uiStore).
 *
 * Voices come from the documented OpenAI gpt-4o-mini-tts enum (`nova`, `alloy`, etc.).
 * Each voice gets a short translated description via `tts.voice_desc.<name>` —
 * unknown voices fall back to a generic label.
 */
export function VoicePicker({ voices, value, onChange, disabled }: VoicePickerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const options = useMemo(
    () =>
      voices.map((v) => {
        const descKey = `tts.voice_desc.${v}`;
        const desc = t(descKey, { defaultValue: '' });
        return {
          value: v,
          label: (
            <span>
              <strong>{v}</strong>
              {desc ? ` — ${desc}` : ''}
            </span>
          ),
        };
      }),
    [voices, t],
  );

  const handleChange = useCallback(
    (v: string) => {
      onChange(v);
    },
    [onChange],
  );

  return (
    <div className={styles.row}>
      <Text className={styles.label}>{t('tts.voice_label')}</Text>
      <Select
        className={styles.select}
        value={value}
        onChange={handleChange}
        options={options}
        disabled={disabled}
        size="middle"
        showSearch
        optionFilterProp="value"
      />
    </div>
  );
}
