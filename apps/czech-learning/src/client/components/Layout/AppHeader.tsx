import { LogoutOutlined, QrcodeOutlined, SafetyCertificateOutlined, TranslationOutlined } from '@ant-design/icons';
import { HeaderBar, LanguageSwitcher, ThemeToggle, UserMenu } from '@personal-hub/browser/ui';
import { App, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { FlagRU, FlagUS } from '../Flags';
import { TotpSetupModal } from './TotpSetupModal';

const { Title, Text } = Typography;
const languages = [
  {
    value: 'en',
    label: (
      <>
        <FlagUS size={18} /> EN
      </>
    ),
  },
  {
    value: 'ru',
    label: (
      <>
        <FlagRU size={18} /> RU
      </>
    ),
  },
];

const useStyles = createStyles(({ css, token }) => ({
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
  emailText: css`
    font-size: 12px;
  `,
  totpActiveIcon: css`
    color: ${token.colorSuccess};
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
        <LanguageSwitcher
          label={t('header.user_menu.language')}
          value={i18n.language.startsWith('ru') ? 'ru' : 'en'}
          languages={languages}
          onChange={(language) => {
            void i18n.changeLanguage(language);
          }}
        />
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
      <HeaderBar
        actions={
          <>
            <ThemeToggle
              isDark={isDarkTheme}
              onClick={toggleTheme}
              lightLabel={t('header.theme_light')}
              darkLabel={t('header.theme_dark')}
            />
            <UserMenu items={userMenuItems} label={t('header.user_menu_label')} />
          </>
        }
      >
        <span className={styles.logoEmoji}>🇨🇿</span>
        <Title level={4} className={styles.title}>
          Czech Learning
        </Title>
      </HeaderBar>

      <TotpSetupModal open={totpModalOpen} onClose={() => setTotpModalOpen(false)} />
    </>
  );
}
