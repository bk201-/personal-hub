import { CloseOutlined, LinkOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { createStyles, keyframes } from 'antd-style';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLinkLabel } from '../newsUtils';

const ICON_CLOSE = <CloseOutlined />;

const panelIn = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const useStyles = createStyles(({ css }) => ({
  anchor: css`
    position: relative;
    height: 0;
    overflow: visible;
    z-index: 25;
    flex-shrink: 0;
  `,
  panel: css`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    max-height: 48vh;
    display: flex;
    flex-direction: column;
    background: rgba(20, 20, 30, 0.88);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #fff;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    z-index: 25;
    animation: ${panelIn} 0.2s cubic-bezier(0.34, 1.1, 0.64, 1);
  `,
  panelHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  `,
  closeBtn: css`
    color: rgba(255, 255, 255, 0.8);
  `,
  panelBody: css`
    overflow-y: auto;
    padding: 10px 14px 14px;
    flex: 1;
  `,
  linkList: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  linkRow: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 10px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.06);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
    &:hover {
      background: rgba(255, 255, 255, 0.13);
    }
  `,
  linkLabel: css`
    font-size: 13px;
    font-weight: 600;
    color: #7eb8ff;
  `,
  linkIcon: css`
    margin-right: 6px;
    opacity: 0.7;
  `,
  linkUrl: css`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  textContent: css`
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.65;
    margin: 0;
  `,
}));

interface NewsDetailTopPanelProps {
  panel: 'links' | 'text';
  links: string[];
  text?: string;
  onClose: () => void;
}

export function NewsDetailTopPanel({ panel, links, text, onClose }: NewsDetailTopPanelProps) {
  const { styles } = useStyles();
  const { t } = useTranslation();

  return (
    <div className={styles.anchor}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>
            {panel === 'links'
              ? t('news.detail.links_count', { count: links.length })
              : t('news.detail.text_panel_title')}
          </span>
          <Button type="text" size="small" icon={ICON_CLOSE} onClick={onClose} className={styles.closeBtn} />
        </div>
        <div className={styles.panelBody}>
          {panel === 'links' ? (
            <div className={styles.linkList}>
              {links.map((link, i) => (
                <a key={link} href={link} target="_blank" rel="noopener noreferrer" className={styles.linkRow}>
                  <span className={styles.linkLabel}>
                    <LinkOutlined className={styles.linkIcon} />
                    {getLinkLabel(link, i, t('news.detail.link_fallback', { n: i + 1 }))}
                  </span>
                  <span className={styles.linkUrl}>{link}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className={styles.textContent}>{text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
