import { createStyles } from 'antd-style';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { inlineRefs } from './digestUtils';

const useStyles = createStyles(({ css, token }) => ({
  markdown: css`
    font-size: 14px;
    line-height: 1.7;
    h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 16px 0 6px;
      color: ${token.colorText};
    }
    h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 12px 0 4px;
      color: ${token.colorText};
    }
    ul {
      padding-left: 20px;
      margin: 4px 0;
    }
    li {
      margin: 3px 0;
    }
    strong {
      color: ${token.colorText};
    }
    p {
      margin: 6px 0;
    }
  `,
  chip: css`
    margin: 0 2px;
    font-size: 11px;
    padding: 0 5px;
    line-height: 18px;
    vertical-align: baseline;
    border-radius: 9px;
  `,
}));

interface DigestBodyProps {
  text: string;
  /** Citation index (1-based) → newsId mapping. Empty while streaming before ref_map arrives. */
  refMap: Record<number, number>;
  onRefClick: (newsId: number) => void;
}

export function DigestBody({ text, refMap, onRefClick }: DigestBodyProps) {
  const { styles } = useStyles();

  // Rebuild components only when refMap, callback or chip class changes
  const components = useMemo(() => {
    const process = (children: React.ReactNode) => inlineRefs(children, refMap, onRefClick, styles.chip);
    return {
      p: ({ children }: { children?: React.ReactNode }) => <p>{process(children)}</p>,
      li: ({ children }: { children?: React.ReactNode }) => <li>{process(children)}</li>,
      h2: ({ children }: { children?: React.ReactNode }) => <h2>{process(children)}</h2>,
      h3: ({ children }: { children?: React.ReactNode }) => <h3>{process(children)}</h3>,
    };
  }, [refMap, onRefClick, styles.chip]);

  return (
    <div className={styles.markdown}>
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
