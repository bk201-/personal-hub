import { SoundOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReadAloudModal } from './ReadAloudModal';

const ICON_SOUND = <SoundOutlined />;

export interface ReadAloudButtonProps {
  /** Plain text or markdown to be read aloud. */
  text: string;
  /** Optional short label shown in the modal header (e.g. article title). */
  title?: string;
  /** Optional CSS class for the visible button label span — used to hide text on narrow toolbars. */
  labelClassName?: string;
}

/**
 * Context-free button that opens a Read Aloud modal for the given text.
 * Knows nothing about news, digests, or anything else — pure `{ text, title? }`.
 */
export function ReadAloudButton({ text, title, labelClassName }: ReadAloudButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const disabled = !text || !text.trim();

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <Tooltip title={t('tts.button_tooltip')}>
        <Button icon={ICON_SOUND} size="small" onClick={handleOpen} disabled={disabled}>
          <span className={labelClassName}>{t('tts.button')}</span>
        </Button>
      </Tooltip>
      <ReadAloudModal open={open} onClose={handleClose} text={text} title={title} />
    </>
  );
}
