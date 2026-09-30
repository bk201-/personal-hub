import React, { useState } from 'react';
import { Layout, Typography, Button, Dropdown, App } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  TranslationOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { FlagRU, FlagUS } from '../Flags';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { TotpSetupModal } from './TotpSetupModal';

const { Header } = Layout;
const { Title, Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  header: css`
    display: flex;
    align-items: center;
    background: ${token.colorPrimary};
    padding: 0 24px;
    gap: 12px;
  `,
  iconBtn: css`
    color: ${token.colorTextLightSolid};
    flex-shrink: 0;
  `,
  logoEmoji: css`
    font-size: 24px;
    flex-shrink: 0;
    height: 26px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  title: css`
    margin: 0;
    color: ${token.colorTextLightSolid};
    white-space: nowrap;
    line-height: 1.2;
  `,
  actions: css`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
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
}));

export function AppHeader() {
  const { isDarkTheme, toggleTheme } = useUIStore();
  const { user, clearAuth, updateUser } = useAuthStore();
  const { styles } = useStyles();
  const { t, i18n } = useTranslation();
  const { modal } = App.useApp();
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  const handleLogout = async () => {
    await api.post('/auth/logout', {}).catch(() => {});
    clearAuth();
  };

  const handleDisableTOTP = () => {
    modal.confirm({
      title: t('auth.totp_setup.disable_confirm_title'),
      content: t('auth.totp_setup.disable_confirm_content'),
      okText: t('auth.totp_setup.disable_ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await api.delete('/auth/totp');
        updateUser({ hasTOTP: false });
      },
    });
  };

  const userMenuItems = [
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
      icon: user?.hasTOTP ? <SafetyCertificateOutlined className={styles.totpActiveIcon} /> : <QrcodeOutlined />,
      label: user?.hasTOTP ? t('auth.totp_setup.manage') : t('auth.totp_setup.enable'),
      onClick: user?.hasTOTP ? handleDisableTOTP : () => setTotpModalOpen(true),
    },
    { type: 'divider' as const },
    {
      key: 'language',
      icon: <TranslationOutlined />,
      label: (
        <div className={styles.langSwitcher} onClick={(e) => e.stopPropagation()}>
          <span className={styles.langLabel}>{t('header.user_menu.language')}:</span>
          <Button
            size="small"
            type={!i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('en');
            }}
            className={styles.langBtn}
          >
            <FlagUS size={18} /> EN
          </Button>
          <Button
            size="small"
            type={i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('ru');
            }}
            className={styles.langBtn}
          >
            <FlagRU size={18} /> RU
          </Button>
        </div>
      ),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('header.user_menu.logout'),
      danger: true,
      onClick: () => void handleLogout(),
    },
  ];

  return (
    <>
      <Header className={styles.header}>
        <span className={styles.logoEmoji}>🇨🇿</span>
        <Title level={4} className={styles.title}>
          Czech Learning
        </Title>
        <div className={styles.actions}>
          <Button
            type="text"
            icon={isDarkTheme ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            aria-label={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}
            className={styles.iconBtn}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <Button
              type="text"
              icon={<UserOutlined />}
              aria-label={t('header.user_menu_label')}
              className={styles.iconBtn}
            />
          </Dropdown>
        </div>
      </Header>

      <TotpSetupModal open={totpModalOpen} onClose={() => setTotpModalOpen(false)} />
    </>
  );
}
