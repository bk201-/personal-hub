import { OrderedListOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Channel, ChannelType } from '@shared/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Modal, Space, Switch, Typography } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  channelKeys,
  useChannelLookup,
  useChannels,
  useCreateChannel,
  useDeleteChannel,
  useFetchChannel,
  useReorderChannels,
  useUpdateChannel,
} from '../../api/channels';
import { ApiError } from '../../api/client';
import { useGroups } from '../../api/groups';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { ChannelFetchModal } from './ChannelFetchModal';
import { ChannelFormModal } from './ChannelFormModal';
import { ChannelItem } from './ChannelItem';
import { SortModal } from './SortModal';
import { useChannelHotkeys } from './useChannelHotkeys';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  sidebar: css`
    display: flex;
    flex-direction: column;
    height: 100%;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  list: css`
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  loading: css`
    padding: 16px;
  `,
  sidebarTitle: css`
    font-size: 14px;
  `,
}));

const ICON_PLUS = <PlusOutlined />;
const ICON_ORDERED_LIST = <OrderedListOutlined />;
const ICON_RELOAD = <ReloadOutlined />;

export function ChannelSidebar() {
  const { data: allChannels = [], isLoading } = useChannels();
  const { data: groups = [] } = useGroups();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const fetchChannel = useFetchChannel();
  const lookupChannel = useChannelLookup();
  const reorderChannels = useReorderChannels();
  const { t } = useTranslation();

  const {
    selectedChannelId,
    setSelectedChannelId,
    selectedGroupId,
    setSelectedGroupId,
    autoAdvance,
    toggleAutoAdvance,
  } = useUIStore();
  const { styles } = useStyles();
  const qc = useQueryClient();
  const { message } = App.useApp();

  useChannelHotkeys();

  const channels = allChannels.filter((ch) =>
    selectedGroupId === null ? !ch.groupId : ch.groupId === selectedGroupId,
  );

  // ── Refresh all channels in the current group ─────────────────────────
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const handleRefreshAll = useCallback(async () => {
    setIsFetchingAll(true);
    try {
      await Promise.allSettled(channels.map((ch) => fetchChannel.mutateAsync({ id: ch.id })));
      // Refresh channel list from DB to get accurate unread counts
      void qc.invalidateQueries({ queryKey: channelKeys.all });
    } finally {
      setIsFetchingAll(false);
    }
  }, [channels, fetchChannel, qc]);

  // ── Form modal state ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [form] = Form.useForm();

  const openCreate = useCallback(() => {
    setEditingChannel(null);
    form.resetFields();
    form.setFieldValue('groupId', selectedGroupId ?? undefined);
    setModalOpen(true);
  }, [form, selectedGroupId]);

  // Auto-open create modal when triggered from empty state CTA
  const openAddChannel = useUIStore((s) => s.openAddChannel);
  useEffect(() => {
    if (openAddChannel) {
      openCreate();
      useUIStore.getState().setOpenAddChannel(false);
    }
  }, [openAddChannel, openCreate]);

  const openEdit = useCallback(
    (ch: Channel) => {
      setEditingChannel(ch);
      // Clear any stale validation state / values from a previous create or edit
      // so changing only the group field is still treated as a valid form.
      form.resetFields();
      form.setFieldsValue({
        telegramId: ch.telegramId,
        name: ch.name,
        description: ch.description,
        channelType: ch.channelType,
        groupId: ch.groupId ?? undefined,
      });
      setModalOpen(true);
    },
    [form],
  );

  const handleSave = useCallback(async () => {
    let values: {
      telegramId: string;
      name: string;
      description?: string;
      channelType: ChannelType;
      groupId?: number;
    };
    try {
      values = (await form.validateFields()) as typeof values;
    } catch {
      // antd surfaces field-level errors in the form itself — nothing more to do here.
      return;
    }

    try {
      if (editingChannel) {
        const newGroupId = values.groupId ?? null;
        await updateChannel.mutateAsync({ id: editingChannel.id, ...values, groupId: newGroupId });
        void message.success(t('channels.update_success'));
        // If the channel moved to a different group, follow it so the user can see it.
        if (newGroupId !== (editingChannel.groupId ?? null)) {
          setSelectedGroupId(newGroupId);
          setSelectedChannelId(editingChannel.id);
        }
      } else {
        await createChannel.mutateAsync({ ...values, groupId: values.groupId ?? null });
      }
      setModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        form.setFields([{ name: 'telegramId', errors: [t('channels.form.already_exists')] }]);
      } else {
        throw err;
      }
    }
  }, [form, editingChannel, updateChannel, createChannel, message, t, setSelectedGroupId, setSelectedChannelId]);

  const handleSaveVoid = useCallback(() => void handleSave(), [handleSave]);

  const handleTelegramIdBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      if (editingChannel) return;
      const raw = e.target.value.trim();
      if (!raw || (form.getFieldValue('name') as string | undefined)) return;
      setLookupLoading(true);
      try {
        const info = await lookupChannel.mutateAsync(raw);
        form.setFieldsValue({ name: info.name, ...(info.description ? { description: info.description } : {}) });
      } catch {
        /* silent */
      } finally {
        setLookupLoading(false);
      }
    },
    [editingChannel, form, lookupChannel],
  );

  // ── Fetch modal state ─────────────────────────────────────────────────
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchTargetId, setFetchTargetId] = useState<number | null>(null);
  const [fetchSince, setFetchSince] = useState<dayjs.Dayjs | null>(null);

  // ── Sort modal state ──────────────────────────────────────────────────
  const [sortModalOpen, setSortModalOpen] = useState(false);

  const openFetchModal = useCallback((ch: Channel) => {
    setFetchTargetId(ch.id);
    setFetchSince(ch.lastFetchedAt ? dayjs.unix(ch.lastFetchedAt) : null);
    setFetchModalOpen(true);
  }, []);

  const handleFetch = useCallback(async () => {
    if (!fetchTargetId) return;
    await fetchChannel.mutateAsync({ id: fetchTargetId, since: fetchSince ? fetchSince.toISOString() : undefined });
    setFetchModalOpen(false);
  }, [fetchTargetId, fetchChannel, fetchSince]);

  const handleDelete = useCallback(
    (ch: Channel) => {
      Modal.confirm({
        title: t('channels.delete_confirm_title', { name: ch.name }),
        content: t('channels.delete_confirm_content'),
        okText: t('common.delete'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: () => deleteChannel.mutateAsync(ch.id),
      });
    },
    [t, deleteChannel],
  );

  const handleOpenSortModal = useCallback(() => setSortModalOpen(true), []);
  const handleCloseSortModal = useCallback(() => setSortModalOpen(false), []);
  const handleCloseModal = useCallback(() => setModalOpen(false), []);
  const handleCloseFetchModal = useCallback(() => setFetchModalOpen(false), []);
  const handleRefreshAllClick = useCallback(() => void handleRefreshAll(), [handleRefreshAll]);

  const sortItems = useMemo(() => channels.map((ch) => ({ id: ch.id, name: ch.name })), [channels]);

  const handleSortSave = useCallback(
    (ordered: { id: number; sortOrder: number }[]) => {
      reorderChannels.mutate(ordered, { onSuccess: handleCloseSortModal });
    },
    [reorderChannels, handleCloseSortModal],
  );

  return (
    <nav className={styles.sidebar} aria-label={t('sidebar.channels')}>
      <div className={styles.header}>
        <Text strong className={styles.sidebarTitle}>
          {t('sidebar.channels')}
        </Text>
        <Space size={4}>
          <Tooltip title={t('sidebar.auto_advance_tooltip')}>
            <Switch size="small" checked={autoAdvance} onChange={toggleAutoAdvance} />
          </Tooltip>
          <Tooltip title={t('sidebar.add_tooltip')}>
            <Button icon={ICON_PLUS} onClick={openCreate} />
          </Tooltip>
          <Tooltip title={t('sidebar.sort_tooltip')}>
            <Button icon={ICON_ORDERED_LIST} onClick={handleOpenSortModal} />
          </Tooltip>
          <Tooltip title={t('sidebar.refresh_tooltip')}>
            <Button icon={ICON_RELOAD} onClick={handleRefreshAllClick} loading={isFetchingAll} />
          </Tooltip>
        </Space>
      </div>

      <div role="listbox" aria-label={t('sidebar.channels')} className={styles.list}>
        {isLoading && <div className={styles.loading}>{t('common.loading')}</div>}
        {channels.map((ch) => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            isSelected={selectedChannelId === ch.id}
            isFetchingThis={fetchChannel.isPending && fetchTargetId === ch.id}
            unreadCount={ch.unreadCount || 0}
            onSelect={setSelectedChannelId}
            onFetch={openFetchModal}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <ChannelFormModal
        open={modalOpen}
        editingChannel={editingChannel}
        allChannels={allChannels}
        form={form}
        groups={groups}
        lookupLoading={lookupLoading}
        confirmLoading={createChannel.isPending || updateChannel.isPending}
        onClose={handleCloseModal}
        onSave={handleSaveVoid}
        onTelegramIdBlur={handleTelegramIdBlur}
      />

      <ChannelFetchModal
        open={fetchModalOpen}
        fetchSince={fetchSince}
        loading={fetchChannel.isPending}
        onChangeSince={setFetchSince}
        onClose={handleCloseFetchModal}
        onConfirm={handleFetch}
      />

      <SortModal
        open={sortModalOpen}
        title={t('sidebar.sort_title')}
        items={sortItems}
        loading={reorderChannels.isPending}
        onClose={handleCloseSortModal}
        onSave={handleSortSave}
      />
    </nav>
  );
}
