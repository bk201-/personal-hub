import { FolderFilled, OrderedListOutlined, PlusOutlined } from '@ant-design/icons';
import type { Group } from '@shared/types.ts';
import { Button, Form, Modal, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../api/channels';
import {
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useReorderGroups,
  useUpdateGroup,
  useVerifyGroupPIN,
} from '../../api/groups';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { formatUnreadBadgeCount } from './formatUnreadBadgeCount';
import { PRESET_COLORS } from './groupFormConstants';
import type { GroupFormValues } from './groupFormConstants';
import { GroupFormModal } from './GroupFormModal';
import { GroupItem } from './GroupItem';
import { useGroupItemStyles } from './groupItemStyles';
import { GroupPinModal } from './GroupPinModal';
import { SortModal } from './SortModal';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  panel: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 72px;
    flex-shrink: 0;
    padding: 8px 0;
    overflow-y: auto;
    gap: 4px;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  addBtn: css`
    width: 36px !important;
    height: 36px !important;
    border-radius: 50% !important;
    margin-top: 4px;
    flex-shrink: 0;
  `,
  generalIcon: css`
    font-size: 22px;
    color: ${token.colorTextSecondary};
  `,
  generalLabel: css`
    color: ${token.colorTextSecondary};
  `,
}));

const ICON_PLUS = <PlusOutlined />;
const ICON_ORDERED_LIST = <OrderedListOutlined />;

export function GroupPanel() {
  const { data: groups = [] } = useGroups();
  const { data: channels = [] } = useChannels();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const verifyPIN = useVerifyGroupPIN();
  const reorderGroups = useReorderGroups();

  const { selectedGroupId, setSelectedGroupId } = useUIStore();
  const { unlockedGroupIds } = useAuthStore();
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const { styles: itemStyles } = useGroupItemStyles();

  // ── Form modal state ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [form] = Form.useForm<GroupFormValues>();

  // ── PIN modal state ───────────────────────────────────────────────────
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Group | null>(null);
  const [pinError, setPinError] = useState('');
  const [pinValue, setPinValue] = useState('');

  // ── Sort modal state ──────────────────────────────────────────────────
  const [sortModalOpen, setSortModalOpen] = useState(false);

  // ── Unread counts ─────────────────────────────────────────────────────
  const generalCount = channels.filter((ch) => !ch.groupId).reduce((s, ch) => s + (ch.unreadCount || 0), 0);
  const groupCounts = groups.reduce<Record<number, number>>((acc, g) => {
    acc[g.id] = channels.filter((ch) => ch.groupId === g.id).reduce((s, ch) => s + (ch.unreadCount || 0), 0);
    return acc;
  }, {});

  // ── Handlers ──────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingGroup(null);
    setSelectedColor(PRESET_COLORS[0]);
    form.resetFields();
    form.setFieldValue('color', PRESET_COLORS[0]);
    setModalOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (g: Group) => {
      setEditingGroup(g);
      setSelectedColor(g.color);
      form.setFieldsValue({ name: g.name, color: g.color });
      setModalOpen(true);
    },
    [form],
  );

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    if (editingGroup) {
      await updateGroup.mutateAsync({
        id: editingGroup.id,
        name: values.name,
        color: selectedColor,
        ...(values.pin ? { pin: values.pin } : {}),
        ...(values.removePin ? { pin: null } : {}),
      });
    } else {
      await createGroup.mutateAsync({
        name: values.name,
        color: selectedColor,
        ...(values.pin ? { pin: values.pin } : {}),
      });
    }
    setModalOpen(false);
  }, [form, editingGroup, updateGroup, createGroup, selectedColor]);

  const handleSaveVoid = useCallback(() => void handleSave(), [handleSave]);

  const handleDelete = useCallback(
    (g: Group) => {
      Modal.confirm({
        title: t('groups.delete_confirm_title', { name: g.name }),
        content: t('groups.delete_confirm_content'),
        okText: t('common.delete'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: () =>
          deleteGroup.mutateAsync(g.id).then(() => {
            if (selectedGroupId === g.id) setSelectedGroupId(null);
          }),
      });
    },
    [t, deleteGroup, selectedGroupId, setSelectedGroupId],
  );

  const handleGroupClick = useCallback(
    (g: Group) => {
      if (g.hasPIN && !unlockedGroupIds.includes(g.id)) {
        setPinTarget(g);
        setPinValue('');
        setPinError('');
        setPinModalOpen(true);
        return;
      }
      setSelectedGroupId(g.id);
    },
    [unlockedGroupIds, setSelectedGroupId],
  );

  const handleVerifyPIN = useCallback(
    async (pin?: string) => {
      if (!pinTarget) return;
      const value = pin ?? pinValue;
      if (!value) return;
      try {
        await verifyPIN.mutateAsync({ id: pinTarget.id, pin: value });
        setSelectedGroupId(pinTarget.id);
        setPinModalOpen(false);
      } catch {
        setPinError(t('groups.pin_modal.wrong_pin'));
      }
    },
    [pinTarget, pinValue, verifyPIN, setSelectedGroupId, t],
  );

  const handleVerifyPINVoid = useCallback((pin?: string) => void handleVerifyPIN(pin), [handleVerifyPIN]);

  const handlePinChange = useCallback((val: string) => {
    setPinValue(val);
    setPinError('');
  }, []);

  const handleSelectGeneral = useCallback(() => setSelectedGroupId(null), [setSelectedGroupId]);
  const handleGeneralKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedGroupId(null);
      }
    },
    [setSelectedGroupId],
  );
  const handleOpenSortModal = useCallback(() => setSortModalOpen(true), []);
  const handleCloseSortModal = useCallback(() => setSortModalOpen(false), []);
  const handleCloseModal = useCallback(() => setModalOpen(false), []);
  const handleClosePinModal = useCallback(() => setPinModalOpen(false), []);

  const sortItems = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name, color: g.color })), [groups]);

  const handleSortSave = useCallback(
    (ordered: { id: number; sortOrder: number }[]) => {
      reorderGroups.mutate(ordered, { onSuccess: handleCloseSortModal });
    },
    [reorderGroups, handleCloseSortModal],
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <nav className={styles.panel} aria-label={t('groups.panel_label')}>
      {/* "Общее" — always first */}
      <Tooltip title={t('groups.general_tooltip')} placement="right">
        <div
          role="option"
          aria-selected={selectedGroupId === null}
          tabIndex={0}
          className={cx(itemStyles.item, selectedGroupId === null && itemStyles.itemActive)}
          onClick={handleSelectGeneral}
          onKeyDown={handleGeneralKeyDown}
        >
          <div className={itemStyles.iconWrap}>
            <FolderFilled className={styles.generalIcon} />
            {generalCount > 0 && <span className={itemStyles.badge}>{formatUnreadBadgeCount(generalCount)}</span>}
          </div>
          <Text className={cx(itemStyles.label, styles.generalLabel)} ellipsis>
            {t('groups.general')}
          </Text>
        </div>
      </Tooltip>

      {/* User groups */}
      {groups.map((g) => (
        <GroupItem
          key={g.id}
          group={g}
          isActive={selectedGroupId === g.id}
          isLocked={g.hasPIN && !unlockedGroupIds.includes(g.id)}
          count={groupCounts[g.id] || 0}
          onClick={handleGroupClick}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ))}

      {/* Add group button */}
      <Tooltip title={t('groups.new_group_tooltip')} placement="right">
        <Button type="dashed" icon={ICON_PLUS} className={styles.addBtn} onClick={openCreate} size="small" />
      </Tooltip>

      {/* Sort groups button — only shown when there are groups to sort */}
      {groups.length > 1 && (
        <Tooltip title={t('groups.sort_tooltip')} placement="right">
          <Button icon={ICON_ORDERED_LIST} className={styles.addBtn} onClick={handleOpenSortModal} size="small" />
        </Tooltip>
      )}

      <GroupFormModal
        open={modalOpen}
        editingGroup={editingGroup}
        form={form}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
        confirmLoading={createGroup.isPending || updateGroup.isPending}
        onClose={handleCloseModal}
        onSave={handleSaveVoid}
      />

      <GroupPinModal
        open={pinModalOpen}
        pinTarget={pinTarget}
        pinValue={pinValue}
        pinError={pinError}
        confirmLoading={verifyPIN.isPending}
        onClose={handleClosePinModal}
        onConfirm={handleVerifyPINVoid}
        onPinChange={handlePinChange}
      />

      <SortModal
        open={sortModalOpen}
        title={t('groups.sort_title')}
        items={sortItems}
        loading={reorderGroups.isPending}
        onClose={handleCloseSortModal}
        onSave={handleSortSave}
      />
    </nav>
  );
}
