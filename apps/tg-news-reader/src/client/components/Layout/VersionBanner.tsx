import { CloseOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useVersionCheck } from '../../hooks/useVersionCheck';

const { Text } = Typography;

const ICON_CLOSE = <CloseOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  banner: css`
    position: sticky;
    top: 0;
    z-index: 20;
    background: ${token.colorInfoBg};
    border-bottom: 1px solid ${token.colorInfoBorder};
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  `,
  text: css`
    color: ${token.colorInfoText};
    flex: 1;
    min-width: 0;
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
  actionBtn: css`
    flex-shrink: 0;
  `,
}));

export function VersionBanner() {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const { newVersionAvailable, dismiss, reload } = useVersionCheck();

  if (!newVersionAvailable) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Text className={styles.text}>{t('common.newVersionAvailable')}</Text>
      <div className={styles.actions}>
        <Button type="primary" size="small" onClick={reload} className={styles.actionBtn}>
          {t('common.newVersionReload')}
        </Button>
        <Button type="text" size="small" icon={ICON_CLOSE} aria-label={t('common.close')} onClick={dismiss} />
      </div>
    </div>
  );
}
