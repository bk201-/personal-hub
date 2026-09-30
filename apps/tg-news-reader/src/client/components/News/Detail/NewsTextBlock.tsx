import { createStyles } from 'antd-style';
import React from 'react';

const useStyles = createStyles(({ css, token }) => ({
  block: css`
    width: 100%;
    max-width: 680px;
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillAlter};
    border-radius: 8px;
    padding: 16px 20px;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.75;
    color: ${token.colorText};
    word-break: break-word;
  `,
}));

interface NewsTextBlockProps {
  text: string;
}

/** Infoblock card that wraps the Telegram post text (item.text). */
export function NewsTextBlock({ text }: NewsTextBlockProps) {
  const { styles } = useStyles();
  return <div className={styles.block}>{text}</div>;
}
