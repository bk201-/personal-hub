import {
  ClearOutlined,
  LogoutOutlined,
  MinusOutlined,
  PlusOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  TagOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import { Button, Modal, Typography } from 'antd';
import type { App } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { APP_VERSION } from '../../appVersion';
import { clearSwCache } from '../../services/serviceWorker';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { FlagRU, FlagUS } from '../Flags';

const { Text } = Typography;

const ICON_CLEAR = <ClearOutlined />;
const ICON_TRANSLATION = <TranslationOutlined />;
const ICON_TAG = <TagOutlined />;
const ICON_LOGOUT = <LogoutOutlined />;
const ICON_QRCODE = <QrcodeOutlined />;
const ICON_MINUS = <MinusOutlined />;
const ICON_PLUS = <PlusOutlined />;

const stopPropagation = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

/** Language switcher row content — extracted to keep menu items free of inline closures. */
function LangSwitcher({
  className,
  labelClassName,
  btnClassName,
  label,
  currentLang,
}: {
  className: string;
  labelClassName: string;
  btnClassName: string;
  label: string;
  currentLang: string;
}) {
  const { i18n } = useTranslation();
  const isRu = currentLang.startsWith('ru');

  const handleEn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void i18n.changeLanguage('en');
    },
    [i18n],
  );

  const handleRu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void i18n.changeLanguage('ru');
    },
    [i18n],
  );

  return (
    <div className={className} onClick={stopPropagation}>
      <span className={labelClassName}>{label}:</span>
      <Button size="small" type={!isRu ? 'primary' : 'default'} onClick={handleEn} className={btnClassName}>
        <FlagUS size={18} /> EN
      </Button>
      <Button size="small" type={isRu ? 'primary' : 'default'} onClick={handleRu} className={btnClassName}>
        <FlagRU size={18} /> RU
      </Button>
    </div>
  );
}

const FONT_SIZE_STEP = 10;
const FONT_SIZE_MIN = 100;
const FONT_SIZE_MAX = 200;

/** Font size control row for the user menu */
function FontSizeRow({
  className,
  labelClassName,
  fontSizeLabelClassName,
}: {
  className: string;
  labelClassName: string;
  fontSizeLabelClassName: string;
}) {
  const { t } = useTranslation();
  const { newsFontSize, setNewsFontSize } = useUIStore();

  const handleDecrease = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNewsFontSize(newsFontSize - FONT_SIZE_STEP);
    },
    [newsFontSize, setNewsFontSize],
  );
  const handleIncrease = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNewsFontSize(newsFontSize + FONT_SIZE_STEP);
    },
    [newsFontSize, setNewsFontSize],
  );

  return (
    <div className={className} onClick={stopPropagation}>
      <span className={labelClassName}>{t('header.user_menu.font_size')}:</span>
      <Button
        size="small"
        icon={ICON_MINUS}
        onClick={handleDecrease}
        disabled={newsFontSize <= FONT_SIZE_MIN}
        aria-label={t('news.detail.font_size_decrease')}
      />
      <span className={fontSizeLabelClassName}>{newsFontSize}%</span>
      <Button
        size="small"
        icon={ICON_PLUS}
        onClick={handleIncrease}
        disabled={newsFontSize >= FONT_SIZE_MAX}
        aria-label={t('news.detail.font_size_increase')}
      />
    </div>
  );
}

const useStyles = createStyles(({ css, token }) => ({
  emailText: css`
    font-size: 12px;
  `,
  totpActiveIcon: css`
    color: ${token.colorSuccess};
  `,
  langSwitcher: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  langLabel: css`
    margin-right: 4px;
  `,
  langBtn: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
  fontSizeRow: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  fontSizeLabel: css`
    margin-right: 4px;
  `,
  fontSizeValue: css`
    min-width: 36px;
    text-align: center;
    font-size: 12px;
    color: ${token.colorTextSecondary};
    user-select: none;
  `,
  fontSizeMenuIcon: css`
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
  `,
}));

interface UserMenuProps {
  message: ReturnType<typeof App.useApp>['message'];
  onOpenTotp: () => void;
}

export function useUserMenuItems({ message, onOpenTotp }: UserMenuProps) {
  const { user, clearAuth, updateUser } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { styles } = useStyles();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAuth();
  };

  const handleClearMediaCache = () => {
    Modal.confirm({
      title: t('header.user_menu.clear_cache_confirm_title'),
      content: t('header.user_menu.clear_cache_confirm_content'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await clearSwCache();
        void message.success(t('header.user_menu.clear_cache_success'));
      },
    });
  };

  const handleDisableTOTP = () => {
    Modal.confirm({
      title: t('header.user_menu.disable_2fa_confirm_title'),
      content: t('header.user_menu.disable_2fa_confirm_content'),
      okText: t('header.user_menu.disable_2fa_ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await api.delete('/auth/totp');
        updateUser({ hasTOTP: false });
      },
    });
  };

  const totpIcon = useMemo(
    () => (user?.hasTOTP ? <SafetyCertificateOutlined className={styles.totpActiveIcon} /> : ICON_QRCODE),
    [user?.hasTOTP, styles.totpActiveIcon],
  );

  return [
    {
      key: 'email',
      label: (
        <Text type="secondary" className={styles.emailText}>
          {user?.email}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'totp',
      icon: totpIcon,
      label: user?.hasTOTP ? t('header.user_menu.manage_2fa') : t('header.user_menu.enable_2fa'),
      onClick: user?.hasTOTP ? handleDisableTOTP : onOpenTotp,
    },
    { type: 'divider' as const },
    {
      key: 'clear-cache',
      icon: ICON_CLEAR,
      label: t('header.user_menu.clear_cache'),
      onClick: handleClearMediaCache,
    },
    { type: 'divider' as const },
    {
      key: 'font-size',
      icon: <span className={styles.fontSizeMenuIcon}>Aa</span>,
      label: (
        <FontSizeRow
          className={styles.fontSizeRow}
          labelClassName={styles.fontSizeLabel}
          fontSizeLabelClassName={styles.fontSizeValue}
        />
      ),
    },
    { type: 'divider' as const },
    {
      key: 'language',
      icon: ICON_TRANSLATION,
      label: (
        <LangSwitcher
          className={styles.langSwitcher}
          labelClassName={styles.langLabel}
          btnClassName={styles.langBtn}
          label={t('header.user_menu.language')}
          currentLang={i18n.language}
        />
      ),
    },
    { type: 'divider' as const },
    {
      key: 'version',
      icon: ICON_TAG,
      label: (
        <Text type="secondary" className={styles.emailText}>
          {t('header.user_menu.version', { version: APP_VERSION })}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: ICON_LOGOUT,
      label: t('header.user_menu.logout'),
      danger: true,
      onClick: () => void handleLogout(),
    },
  ];
}
