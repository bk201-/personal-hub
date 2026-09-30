import { DeleteOutlined, EditOutlined, FolderFilled, LockOutlined } from '@ant-design/icons';
import type { Group } from '@shared/types.ts';
import { Dropdown, Typography } from 'antd';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUnreadBadgeCount } from './formatUnreadBadgeCount';
import { useGroupItemStyles } from './groupItemStyles';

const { Text } = Typography;

const ICON_EDIT = <EditOutlined />;
const ICON_DELETE = <DeleteOutlined />;
const CONTEXT_TRIGGER: ('click' | 'hover' | 'contextMenu')[] = ['contextMenu'];

interface GroupItemProps {
  group: Group;
  isActive: boolean;
  isLocked: boolean;
  count: number;
  onClick: (group: Group) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
}

export function GroupItem({ group, isActive, isLocked, count, onClick, onEdit, onDelete }: GroupItemProps) {
  const { styles, cx } = useGroupItemStyles(group.color);
  const { t } = useTranslation();

  const handleClick = useCallback(() => onClick(group), [onClick, group]);
  const handleEdit = useCallback(() => onEdit(group), [onEdit, group]);
  const handleDelete = useCallback(() => onDelete(group), [onDelete, group]);

  const iconStyle = useMemo(() => ({ color: group.color }), [group.color]);

  const menuDef = useMemo(
    () => ({
      items: [
        { key: 'edit', label: t('groups.context_edit'), icon: ICON_EDIT },
        { key: 'delete', label: t('groups.context_delete'), icon: ICON_DELETE, danger: true as const },
      ],
      onClick: ({ key }: { key: string }) => {
        if (key === 'edit') handleEdit();
        else if (key === 'delete') handleDelete();
      },
    }),
    [t, handleEdit, handleDelete],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <Dropdown menu={menuDef} trigger={CONTEXT_TRIGGER}>
      <div
        role="option"
        aria-selected={isActive}
        tabIndex={0}
        className={cx(styles.item, isActive && styles.itemActive)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.iconWrap}>
          {isLocked ? (
            <LockOutlined className={styles.icon} style={iconStyle} />
          ) : (
            <FolderFilled className={styles.icon} style={iconStyle} />
          )}
          {count > 0 && <span className={styles.badge}>{formatUnreadBadgeCount(count)}</span>}
        </div>
        <Text className={styles.label} ellipsis>
          {group.name}
        </Text>
      </div>
    </Dropdown>
  );
}
