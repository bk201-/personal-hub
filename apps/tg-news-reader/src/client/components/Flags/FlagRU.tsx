import { createStyles } from 'antd-style';
import React from 'react';

const useStyles = createStyles(({ css }) => ({
  flag: css`
    display: inline-block;
    vertical-align: middle;
    border-radius: 2px;
    border: 1px solid rgba(0, 0, 0, 0.12);
  `,
}));

interface FlagProps {
  size?: number;
}

/** Russian flag: white / blue / red horizontal stripes */
export function FlagRU({ size = 20 }: FlagProps) {
  const { styles } = useStyles();
  const h = Math.round((size * 2) / 3);
  return (
    <svg width={size} height={h} viewBox="0 0 3 2" className={styles.flag}>
      <rect width="3" height="0.667" y="0" fill="#fff" />
      <rect width="3" height="0.667" y="0.667" fill="#003da5" />
      <rect width="3" height="0.667" y="1.333" fill="#da291c" />
    </svg>
  );
}
