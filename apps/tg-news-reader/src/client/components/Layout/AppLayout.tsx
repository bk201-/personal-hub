import { PlusOutlined } from '@ant-design/icons';
import { Button, Drawer, Layout, Splitter, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../api/channels';
import { useIsXl, useIsXxl } from '../../hooks/breakpoints';
import { useBossKey } from '../../hooks/useBossKey';
import { useUIStore } from '../../store/uiStore';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { AppHeader } from './AppHeader';
import { DownloadsPinnedContent } from './DownloadsPinnedContent';
import { TelegramSessionBanner } from './TelegramSessionBanner';
import { VersionBanner } from './VersionBanner';

const { Text } = Typography;

const ICON_PLUS = <PlusOutlined />;
const SIDEBAR_DRAWER_BODY_STYLES = { body: { padding: 0, overflow: 'hidden', height: '100%' } };
const NOOP = () => {};

const useStyles = createStyles(({ css, token }) => ({
  sidebarWrap: css`
    display: flex;
    height: 100%;
  `,
  sidebarInner: css`
    flex: 1;
    min-width: 0;
    border-left: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    flex-direction: column;
    gap: 16px;
  `,
  emptyEmoji: css`
    font-size: 64px;
  `,
  emptyText: css`
    font-size: 16px;
  `,
  splitter: css`
    flex: 1;
    min-height: 0;
  `,
  sidebarPanel: css`
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
  sidebarPanelHidden: css`
    overflow: hidden;
    border-right: none !important;
  `,
  contentPanel: css`
    background: ${token.colorBgLayout};
    overflow: hidden;
  `,
  contentFlex: css`
    display: flex;
    height: 100%;
    overflow: hidden;
  `,
  contentMain: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
  `,
  layout: css`
    height: 100vh;
    overflow: hidden;
  `,
  // Mobile layout: body-scroll mode so mobile browser chrome hides on scroll.
  // min-height instead of height so content can exceed the viewport.
  layoutMobile: css`
    min-height: 100dvh;
    overflow: visible;
  `,
  // Mobile wrapper: normal document flow — body is the scroll parent.
  mobileContainer: css`
    background: ${token.colorBgLayout};
  `,
}));

export function AppLayout() {
  const { selectedChannelId, downloadsPanelPinned, sidebarDrawerOpen, setSidebarDrawerOpen } = useUIStore();
  const { data: channels = [] } = useChannels();
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const initialized = useRef(false);

  // Boss key: Esc Esc to lock all PIN groups
  useBossKey();

  // < 1200px → accordion mode: single-scroll mobile layout
  const isAccordionMode = !useIsXl();
  // < 1600px → sidebar in Drawer (desktop only)
  const sidebarInDrawer = !useIsXxl();

  const [defaultSidebarWidth] = useState(() => parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10));

  // Stable refs for use inside the popstate handler (avoid stale closure)
  const selectedChannelRef = useRef(selectedChannelId);
  selectedChannelRef.current = selectedChannelId;
  const sidebarDrawerOpenRef = useRef(sidebarDrawerOpen);
  sidebarDrawerOpenRef.current = sidebarDrawerOpen;

  // ── Mobile navigation guard ────────────────────────────────────────────
  // Push one synthetic guard entry on mount so the very first Back press lands
  // inside the app. Each successful intercept re-pushes the guard so the next
  // Back is also caught.
  //
  // Priority: lightbox (LightboxOverlay handles its own entry) → drawer → channel.
  useEffect(() => {
    if (!isAccordionMode) return;
    history.pushState({ _appGuard: true }, '');

    const onPop = () => {
      // LightboxOverlay pushes its own history entry and has its own popstate
      // handler — bail so we don't double-close.
      if (useUIStore.getState().lightbox) return;

      if (sidebarDrawerOpenRef.current) {
        // Drawer is open → close it
        setSidebarDrawerOpen(false);
      } else if (selectedChannelRef.current !== null) {
        // Channel selected but no drawer → deselect channel and show channel list.
        // Write all fields in one Zustand call so we never get an intermediate
        // render with sidebarDrawerOpen:false (which setSelectedChannelId sets).
        useUIStore.setState({
          selectedChannelId: null,
          selectedNewsId: null,
          hashTagFilter: null,
          sidebarDrawerOpen: true,
        });
      } else {
        // Nothing to intercept — let the navigation proceed (exit the app).
        return;
      }

      // Re-push the guard so the next Back press is also intercepted.
      history.pushState({ _appGuard: true }, '');
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAccordionMode, setSidebarDrawerOpen]);

  useEffect(() => {
    if (initialized.current || channels.length === 0) return;
    initialized.current = true;
    const id = parseInt(new URLSearchParams(window.location.search).get('channel') ?? '', 10);
    const ch = channels.find((c) => c.id === id);
    if (ch) {
      // Restore both channel and its group so the sidebar shows the correct folder
      const groupId = ch.groupId ?? null;
      useUIStore.setState({ selectedChannelId: id, selectedGroupId: groupId });
    }
  }, [channels]);

  useEffect(() => {
    if (!initialized.current) return;
    if (selectedChannelId) {
      history.replaceState(null, '', `?channel=${selectedChannelId}${window.location.hash}`);
    } else {
      history.replaceState(null, '', window.location.pathname);
    }
  }, [selectedChannelId]);

  const handleCloseDrawer = useCallback(() => setSidebarDrawerOpen(false), [setSidebarDrawerOpen]);

  const handleResizeEnd = useCallback(
    (sizes: number[]) => {
      if (!sidebarInDrawer) localStorage.setItem('sidebarWidth', String(Math.round(sizes[0])));
    },
    [sidebarInDrawer],
  );

  const sidebarContent = useMemo(
    () => (
      <div className={styles.sidebarWrap}>
        <GroupPanel />
        <div className={styles.sidebarInner}>
          <ChannelSidebar />
        </div>
      </div>
    ),
    [styles],
  );

  const handleAddChannel = useCallback(() => {
    if (sidebarInDrawer) {
      setSidebarDrawerOpen(true);
      // Small delay so the drawer animation starts first
      setTimeout(() => useUIStore.getState().setOpenAddChannel(true), 300);
    } else {
      useUIStore.getState().setOpenAddChannel(true);
    }
  }, [sidebarInDrawer, setSidebarDrawerOpen]);

  const emptyState = useMemo(
    () => (
      <div className={styles.emptyState}>
        <span className={styles.emptyEmoji}>📡</span>
        {channels.length === 0 ? (
          <>
            <Text type="secondary" className={styles.emptyText}>
              {t('sidebar.empty_no_channels')}
            </Text>
            <Button type="primary" icon={ICON_PLUS} onClick={handleAddChannel}>
              {t('sidebar.add_first_channel')}
            </Button>
          </>
        ) : (
          <Text type="secondary" className={styles.emptyText}>
            {t('sidebar.select_channel')}
          </Text>
        )}
      </div>
    ),
    [styles, t, channels.length, handleAddChannel],
  );

  // ── Sidebar Drawer — shared between mobile and desktop ──────────────────
  const sidebarDrawer = (
    <Drawer
      open={sidebarInDrawer && sidebarDrawerOpen}
      onClose={handleCloseDrawer}
      placement="left"
      size="default"
      mask={false}
      styles={SIDEBAR_DRAWER_BODY_STYLES}
      title={null}
      closable={false}
    >
      {sidebarInDrawer && sidebarContent}
    </Drawer>
  );

  // ── MOBILE (< 1200px): div-based scroll container ─────────────────────
  // AppHeader is in normal flow — scrolls away.
  // NewsFeedToolbar sticks via position:sticky top:0.
  // Scroll is on the mobileContainer div (overflow-y: auto), NOT body.
  if (isAccordionMode) {
    return (
      <Layout className={styles.layoutMobile}>
        {sidebarDrawer}
        <div className={styles.mobileContainer}>
          <VersionBanner />
          <AppHeader />
          <TelegramSessionBanner />
          {selectedChannel ? <NewsFeed channel={selectedChannel} /> : emptyState}
        </div>
      </Layout>
    );
  }

  // ── DESKTOP (≥ 1200px): Splitter layout ────────────────────────────────
  return (
    <Layout className={styles.layout}>
      <VersionBanner />
      <AppHeader />
      <TelegramSessionBanner />
      {sidebarDrawer}
      <Splitter className={styles.splitter} onResize={NOOP} onResizeEnd={handleResizeEnd}>
        <Splitter.Panel
          defaultSize={defaultSidebarWidth}
          min={sidebarInDrawer ? 0 : 200}
          max={sidebarInDrawer ? 0 : 500}
          size={sidebarInDrawer ? 0 : undefined}
          resizable={!sidebarInDrawer}
          className={cx(styles.sidebarPanel, sidebarInDrawer && styles.sidebarPanelHidden)}
        >
          {!sidebarInDrawer && sidebarContent}
        </Splitter.Panel>

        <Splitter.Panel className={styles.contentPanel}>
          <div className={styles.contentFlex}>
            <div className={styles.contentMain}>
              {selectedChannel ? <NewsFeed channel={selectedChannel} /> : emptyState}
            </div>
            {downloadsPanelPinned && <DownloadsPinnedContent />}
          </div>
        </Splitter.Panel>
      </Splitter>
    </Layout>
  );
}
