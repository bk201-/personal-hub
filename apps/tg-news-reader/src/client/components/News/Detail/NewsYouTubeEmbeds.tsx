import { createStyles } from 'antd-style';
import React from 'react';
import { getYouTubeEmbedId, isYouTubeUrl } from '../newsUtils';

const useStyles = createStyles(({ css, token }) => ({
  wrapper: css`
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
  `,
  embedContainer: css`
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: ${token.colorFillAlter};
    border: 1px solid ${token.colorBorderSecondary};
  `,
  iframe: css`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  `,
}));

interface NewsYouTubeEmbedsProps {
  links: string[];
}

export function NewsYouTubeEmbeds({ links }: NewsYouTubeEmbedsProps) {
  const { styles } = useStyles();

  const embeds = links
    .filter(isYouTubeUrl)
    .map((url) => ({ url, id: getYouTubeEmbedId(url) }))
    .filter((e): e is { url: string; id: string } => e.id !== null);

  if (embeds.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {embeds.map(({ url, id }) => (
        <div key={url} className={styles.embedContainer}>
          <iframe
            className={styles.iframe}
            src={`https://www.youtube.com/embed/${id}`}
            title={`YouTube ${id}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ))}
    </div>
  );
}
