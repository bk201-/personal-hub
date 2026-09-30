import { Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mediaUrl } from '../../../api/mediaUrl';

const { Paragraph } = Typography;

const REMARK_PLUGINS = [remarkGfm];

const useStyles = createStyles(({ css, token }) => ({
  wrapper: css`
    width: 100%;
    max-width: 680px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    padding: 16px 20px;
    background: ${token.colorBgContainer};
    word-break: break-word;
  `,
  markdown: css`
    font-size: 14px;
    line-height: 1.8;
    color: ${token.colorText};

    & h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px;
      color: ${token.colorTextHeading};
      line-height: 1.35;
    }
    & h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: ${token.colorTextHeading};
      line-height: 1.4;
    }
    & h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 16px 0 6px;
      color: ${token.colorTextHeading};
    }
    & p {
      margin: 0 0 12px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    & blockquote {
      border-left: 3px solid ${token.colorPrimary};
      margin: 12px 0;
      padding: 4px 0 4px 14px;
      color: ${token.colorTextSecondary};
      font-style: italic;
      & p {
        margin: 0;
      }
    }
    & hr {
      border: none;
      border-top: 1px solid ${token.colorBorderSecondary};
      margin: 20px 0;
    }
    & ul,
    & ol {
      padding-left: 20px;
      margin: 0 0 12px;
    }
    & li {
      margin-bottom: 4px;
    }
    & a {
      color: ${token.colorLink};
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
    & code {
      background: ${token.colorFillAlter};
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 13px;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    & pre {
      background: ${token.colorFillAlter};
      border-radius: 6px;
      padding: 12px 14px;
      overflow-x: auto;
      margin: 0 0 12px;
      & code {
        background: none;
        padding: 0;
        font-size: 13px;
      }
    }
    & em {
      font-style: italic;
    }
    & strong {
      font-weight: 600;
    }
    & table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 12px;
      font-size: 13px;
    }
    & th,
    & td {
      border: 1px solid ${token.colorBorderSecondary};
      padding: 6px 10px;
      text-align: left;
    }
    & th {
      background: ${token.colorFillAlter};
      font-weight: 600;
    }
  `,
  plainText: css`
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.8;
  `,
  image: css`
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 12px 0;
  `,
}));

interface NewsArticleBodyProps {
  content: string;
  format: 'text' | 'markdown';
}

/** Renders extracted article content — Markdown (new) or plain text (legacy). */
export function NewsArticleBody({ content, format }: NewsArticleBodyProps) {
  const { styles } = useStyles();

  // Instant View images are stored as bare local media paths (e.g. "12345/iv_678_0.jpg").
  // Route them through mediaUrl() so the JWT is attached; leave absolute/data URLs as-is.
  const components = useMemo(
    () => ({
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        if (!src) return null;
        const resolved = /^(https?:|data:)/i.test(src) ? src : mediaUrl(src);
        return <img src={resolved} alt={alt ?? ''} loading="lazy" className={styles.image} />;
      },
    }),
    [styles.image],
  );

  return (
    <div className={styles.wrapper}>
      {format === 'markdown' ? (
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <Paragraph className={styles.plainText}>{content}</Paragraph>
      )}
    </div>
  );
}
