import { createStyles } from 'antd-style';

export const useLightboxOverlayStyles = createStyles(({ css, token }) => ({
  overlay: css`
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: rgba(0, 0, 0, 0.93);
    display: flex;
    flex-direction: column;
    outline: none;
    /* Prevent scroll/zoom gestures from passing through to the page */
    touch-action: none;
    overscroll-behavior: contain;
  `,
  // Image takes full area; nav buttons are absolutely positioned on top.
  mediaArea: css`
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  navBtn: css`
    position: absolute;
    top: 0;
    bottom: 48px; /* leave room for video controls at the bottom */
    z-index: 5; /* above LightboxMedia wrap (z-index: 4) */
    width: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: color-mix(in srgb, ${token.colorTextLightSolid} 50%, transparent);
    font-size: 20px;
    cursor: pointer;
    outline: none;
    padding: 0;

    /* Circle around the chevron icon */
    .anticon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: transparent;
      transition:
        background 0.15s,
        color 0.15s;
    }

    &:hover .anticon,
    &:active .anticon {
      background: color-mix(in srgb, ${token.colorTextLightSolid} 15%, transparent);
      color: ${token.colorTextLightSolid};
    }
    &:disabled {
      opacity: 0.15;
      cursor: default;
    }
    &:disabled:hover .anticon {
      background: transparent;
    }
  `,
  navPrev: css`
    left: 0;
  `,
  navNext: css`
    right: 0;
  `,
  counter: css`
    flex-shrink: 0;
    text-align: center;
    color: color-mix(in srgb, ${token.colorTextLightSolid} 45%, transparent);
    font-size: 12px;
    padding: 8px 16px;
    min-height: 28px;
  `,
}));
