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

const SR = 1.9;

function starPath(cx: number, cy: number): string {
  const pts: string[] = [];
  const inner = SR * 0.4;
  for (let i = 0; i < 5; i++) {
    const a1 = (i * 72 - 90) * (Math.PI / 180);
    const a2 = (i * 72 + 36 - 90) * (Math.PI / 180);
    pts.push(`${cx + SR * Math.cos(a1)},${cy + SR * Math.sin(a1)}`);
    pts.push(`${cx + inner * Math.cos(a2)},${cy + inner * Math.sin(a2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function buildStars(): [number, number][] {
  const stars: [number, number][] = [];
  const cw = 76,
    ch = 7 * (100 / 13);
  const hStep = cw / 12,
    vStep = ch / 10;
  for (let row = 0; row < 9; row++) {
    const cols = row % 2 === 0 ? 6 : 5;
    const xStart = row % 2 === 0 ? hStep / 2 : hStep;
    const y = vStep / 2 + row * vStep;
    for (let col = 0; col < cols; col++) stars.push([xStart + col * hStep, y]);
  }
  return stars;
}

const STARS = buildStars();
const SH = 100 / 13;
const CANTON_W = 76;
const CANTON_H = 7 * SH;
// Pre-computed stripe y-positions — used as stable React keys (no index needed)
const STRIPE_Y = Array.from({ length: 13 }, (_, i) => i * SH);

/** US flag: 13 stripes + blue canton with 50 stars */
export function FlagUS({ size = 20 }: FlagProps) {
  const { styles } = useStyles();
  const w = size;
  const h = Math.round((size * 10) / 19);
  return (
    <svg width={w} height={h} viewBox="0 0 190 100" className={styles.flag}>
      {STRIPE_Y.map((y) => (
        <rect key={y} x="0" y={y} width="190" height={SH} fill={Math.round(y / SH) % 2 === 0 ? '#B22234' : '#FFF'} />
      ))}
      <rect x="0" y="0" width={CANTON_W} height={CANTON_H} fill="#3C3B6E" />
      {STARS.map(([cx, cy]) => (
        <path key={`${cx}-${cy}`} d={starPath(cx, cy)} fill="#FFF" />
      ))}
    </svg>
  );
}
