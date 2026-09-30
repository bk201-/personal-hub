import { createStyles } from 'antd-style';

export const useLightboxMediaStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    user-select: none;
    position: relative;
    z-index: 4;
    pointer-events: none;
    & > * {
      pointer-events: auto;
    }
  `,
  media: css`
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    display: block;
    outline: none;
  `,
  spinner: css`
    font-size: 40px;
    color: ${token.colorTextLightSolid};
    opacity: 0.45;
  `,
  loadingOverlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${token.colorBgMask};
    border-radius: 4px;
    pointer-events: none;
  `,
  errorOverlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${token.colorTextLightSolid};
    font-size: 13px;
    pointer-events: none;
  `,
}));
