import { createStyles } from 'antd-style';

export const useGroupItemStyles = createStyles(({ css, token }, color?: string) => {
  const c = color ?? token.colorPrimary;
  return {
    item: css`
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 56px;
      min-height: 56px;
      padding: 6px 4px;
      border-radius: 10px;
      cursor: pointer;
      transition:
        background 0.15s,
        box-shadow 0.15s;
      position: relative;
      background: radial-gradient(circle at 50% 60%, color-mix(in srgb, ${c} 15%, transparent), transparent 70%);
      user-select: none;
      &:hover {
        background: radial-gradient(circle at 50% 60%, color-mix(in srgb, ${c} 25%, transparent), transparent 70%);
      }
      &:focus-visible {
        outline: 2px solid ${c};
        outline-offset: 2px;
      }
    `,
    itemActive: css`
      box-shadow: 0 0 0 2px ${c};
      background: radial-gradient(
        circle at 50% 60%,
        color-mix(in srgb, ${c} 30%, transparent),
        transparent 70%
      ) !important;
    `,
    iconWrap: css`
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    `,
    icon: css`
      font-size: 22px;
    `,
    badge: css`
      position: absolute;
      top: -5px;
      right: -8px;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      font-size: 9px;
      font-weight: 600;
      color: ${token.colorTextLightSolid};
      background: ${token.colorPrimary};
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      line-height: 1;
    `,
    label: css`
      max-width: 52px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block !important;
      font-size: 10px;
      text-align: center;
      line-height: 1.2;
      margin-top: 2px;
    `,
  };
});
