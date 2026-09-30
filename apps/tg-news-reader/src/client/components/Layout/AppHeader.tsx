import { MenuOutlined, MoonOutlined, SunOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Dropdown, Layout, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../api/channels';
import { useIsXxl } from '../../hooks/breakpoints';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { DownloadsPanel } from './DownloadsPanel';
import { LogsPanel } from './LogsPanel';
import { TotpSetupModal } from './TotpSetupModal';
import { useUserMenuItems } from './UserMenu';

const { Header } = Layout;
const { Title, Text } = Typography;

const ICON_MENU = <MenuOutlined />;
const ICON_SUN = <SunOutlined />;
const ICON_MOON = <MoonOutlined />;
const ICON_USER = <UserOutlined />;

const DROPDOWN_TRIGGER: ('click' | 'hover' | 'contextMenu')[] = ['click'];

const useStyles = createStyles(({ css, token }, sidebarInDrawer: boolean) => ({
  header: css`
    display: flex;
    align-items: center;
    background: ${token.colorPrimary};
    padding: ${sidebarInDrawer ? '0 12px' : '0 24px'};
    gap: ${sidebarInDrawer ? '8px' : '12px'};
  `,
  iconBtn: css`
    color: ${token.colorTextLightSolid};
    flex-shrink: 0;
  `,
  emoji: css`
    font-size: 24px;
    flex-shrink: 0;
  `,
  title: css`
    margin: 0;
    color: ${token.colorTextLightSolid};
    white-space: nowrap;
  `,
  channelName: css`
    color: color-mix(in srgb, ${token.colorTextLightSolid} 85%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    margin-left: ${sidebarInDrawer ? '0' : '12px'};
    flex: ${sidebarInDrawer ? '1' : 'unset'};
    font-weight: ${sidebarInDrawer ? '600' : '400'};
  `,
  actions: css`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
}));

export function AppHeader() {
  const { selectedChannelId, isDarkTheme, toggleTheme, setSidebarDrawerOpen } = useUIStore();
  const { data: channels = [] } = useChannels();
  const { message } = App.useApp();
  const { t } = useTranslation();
  const sidebarInDrawer = !useIsXxl();
  const { styles } = useStyles(sidebarInDrawer);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  const handleOpenSidebar = useCallback(() => setSidebarDrawerOpen(true), [setSidebarDrawerOpen]);
  const handleCloseTotpModal = useCallback(() => setTotpModalOpen(false), []);
  const handleOpenTotp = useCallback(() => setTotpModalOpen(true), []);

  const userMenuItems = useUserMenuItems({ message, onOpenTotp: handleOpenTotp });
  const dropdownMenu = useMemo(() => ({ items: userMenuItems }), [userMenuItems]);

  return (
    <>
      <Header className={styles.header}>
        {sidebarInDrawer && (
          <Tooltip title={t('header.open_sidebar')}>
            <Button type="text" icon={ICON_MENU} onClick={handleOpenSidebar} className={styles.iconBtn} />
          </Tooltip>
        )}
        <span className={styles.emoji}>📰</span>
        {!sidebarInDrawer && (
          <Title level={4} className={styles.title}>
            TG News Reader
          </Title>
        )}
        {selectedChannel && (
          <Text className={styles.channelName}>
            {sidebarInDrawer ? selectedChannel.name : `— ${selectedChannel.name}`}
          </Text>
        )}
        <div className={styles.actions}>
          <DownloadsPanel />
          <LogsPanel />
          <Tooltip title={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}>
            <Button
              type="text"
              icon={isDarkTheme ? ICON_SUN : ICON_MOON}
              onClick={toggleTheme}
              aria-label={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}
              className={styles.iconBtn}
            />
          </Tooltip>
          <Dropdown menu={dropdownMenu} placement="bottomRight" trigger={DROPDOWN_TRIGGER}>
            <Button type="text" icon={ICON_USER} aria-label={t('header.user_menu_label')} className={styles.iconBtn} />
          </Dropdown>
        </div>
      </Header>

      <TotpSetupModal open={totpModalOpen} onClose={handleCloseTotpModal} />
    </>
  );
}
