import { NumberOutlined, TagsOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Badge, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBatchFilters, useFilters } from '../../../api/filters';

const { Text } = Typography;

const ICON_NUMBER = <NumberOutlined />;
const ICON_UNDO = <UndoOutlined />;

const useStyles = createStyles(({ css, token }) => ({
  tagRow: css`
    cursor: pointer;
    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorPrimary};
    }
  `,
  activeTag: css`
    border-color: ${token.colorPrimary};
    color: ${token.colorPrimary};
    background: ${token.colorPrimaryBg};
  `,
  pendingLabel: css`
    font-size: 11px;
    color: ${token.colorWarning};
  `,
  filteredLabel: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
  `,
  removingLabel: css`
    font-size: 11px;
    color: ${token.colorError};
    text-decoration: line-through;
  `,
  titleSecondary: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
    font-weight: normal;
  `,
}));

interface TagBrowserModalProps {
  open: boolean;
  channelId: number;
  tagCounts: { tag: string; count: number }[];
  activeHashTag: string | null;
  onSetHashTag: (tag: string) => void;
  onClose: () => void;
}

type TagRow = { tag: string; count: number };

/** Clickable tag cell — has its own stable click handler. */
function TagCell({
  tag,
  className,
  onSetHashTag,
  onClose,
}: {
  tag: string;
  className: string;
  onSetHashTag: (tag: string) => void;
  onClose: () => void;
}) {
  const handleClick = useCallback(() => {
    onSetHashTag(tag);
    onClose();
  }, [onSetHashTag, onClose, tag]);

  return (
    <Tag icon={ICON_NUMBER} className={className} onClick={handleClick}>
      {tag.replace(/^#/, '')}
    </Tag>
  );
}

/** Tag actions cell — stable toggle handler per tag. */
function TagActionsCell({
  tag,
  onToggle,
  variant,
  styles,
  t,
}: {
  tag: string;
  onToggle: (tag: string) => void;
  variant: 'filtered' | 'pendingRemove' | 'pendingAdd' | 'addable';
  styles: ReturnType<typeof useStyles>['styles'];
  t: (key: string) => string;
}) {
  const handleClick = useCallback(() => onToggle(tag), [onToggle, tag]);

  if (variant === 'filtered') {
    return (
      <Space size={4}>
        <Text className={styles.filteredLabel}>{t('tags.filtered')}</Text>
        <Button
          icon={ICON_UNDO}
          size="small"
          type="text"
          danger
          title={t('tags.remove_filter')}
          onClick={handleClick}
        />
      </Space>
    );
  }
  if (variant === 'pendingRemove') {
    return (
      <Space size={4}>
        <Text className={styles.removingLabel}>{t('tags.pending_remove')}</Text>
        <Button icon={ICON_UNDO} size="small" type="text" title={t('tags.undo')} onClick={handleClick} />
      </Space>
    );
  }
  if (variant === 'pendingAdd') {
    return (
      <Space size={4}>
        <Text className={styles.pendingLabel}>{t('tags.pending_add')}</Text>
        <Button icon={ICON_UNDO} size="small" type="text" title={t('tags.undo')} onClick={handleClick} />
      </Space>
    );
  }
  return (
    <Button size="small" type="text" onClick={handleClick}>
      {t('tags.add_filter')}
    </Button>
  );
}

export function TagBrowserModal({
  open,
  channelId,
  tagCounts,
  activeHashTag,
  onSetHashTag,
  onClose,
}: TagBrowserModalProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const { message } = App.useApp();

  const { data: filters = [] } = useFilters(channelId);
  const batchFilters = useBatchFilters(channelId);

  // ── Local pending state — only applied on OK ─────────────────────────
  // pendingAdd: full tag strings (e.g. '#crypto') to create as filters
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set());
  // pendingRemove: filter IDs to delete
  const [pendingRemove, setPendingRemove] = useState<Set<number>>(new Set());

  // Reset pending state whenever the modal opens fresh
  useEffect(() => {
    if (open) {
      setPendingAdd(new Set());
      setPendingRemove(new Set());
    }
  }, [open]);

  // norm → filterId map for existing tag filters from API
  const filteredTagMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filters) {
      if (f.type === 'tag') {
        map.set(f.value.toLowerCase().replace(/^#/, ''), f.id);
      }
    }
    return map;
  }, [filters]);

  // Toggle a tag's pending state (no network calls here)
  const handleToggle = useCallback(
    (tag: string) => {
      const norm = tag.replace(/^#/, '');
      const existingId = filteredTagMap.get(norm);

      if (existingId !== undefined) {
        setPendingRemove((prev) => {
          const next = new Set(prev);
          if (next.has(existingId)) next.delete(existingId);
          else next.add(existingId);
          return next;
        });
      } else {
        setPendingAdd((prev) => {
          const next = new Set(prev);
          if (next.has(tag)) next.delete(tag);
          else next.add(tag);
          return next;
        });
      }
    },
    [filteredTagMap],
  );

  // Commit all pending changes in a single batch request
  const handleOk = useCallback(async () => {
    if (pendingAdd.size === 0 && pendingRemove.size === 0) {
      onClose();
      return;
    }

    await batchFilters.mutateAsync({
      toAdd: [...pendingAdd].map((tag) => ({ name: tag, type: 'tag', value: tag.toLowerCase() })),
      toDelete: [...pendingRemove],
    });

    void message.success(t('tags.changes_applied', { count: pendingAdd.size + pendingRemove.size }));
    onClose();
  }, [pendingAdd, pendingRemove, onClose, batchFilters, message, t]);

  const handleOkVoid = useCallback(() => void handleOk(), [handleOk]);

  const isPendingChanges = pendingAdd.size > 0 || pendingRemove.size > 0;
  const isCommitting = batchFilters.isPending;
  const totalChanges = pendingAdd.size + pendingRemove.size;

  const columns = useMemo(
    () => [
      {
        title: t('tags.col_tag'),
        key: 'tag',
        render: (_: unknown, record: TagRow) => {
          const isActive = !!activeHashTag && activeHashTag.toLowerCase() === record.tag.toLowerCase();
          return (
            <TagCell
              tag={record.tag}
              className={cx(styles.tagRow, isActive && styles.activeTag)}
              onSetHashTag={onSetHashTag}
              onClose={onClose}
            />
          );
        },
      },
      {
        title: t('tags.col_count'),
        dataIndex: 'count',
        key: 'count',
        width: 80,
        defaultSortOrder: 'descend' as const,
        sorter: (a: TagRow, b: TagRow) => a.count - b.count,
        render: (count: number) => <Badge count={count} color="blue" overflowCount={999} showZero />,
      },
      {
        title: '',
        key: 'actions',
        width: 180,
        render: (_: unknown, record: TagRow) => {
          const norm = record.tag.replace(/^#/, '');
          const existingId = filteredTagMap.get(norm);
          const isPendingRm = existingId !== undefined && pendingRemove.has(existingId);
          const isPendingAd = pendingAdd.has(record.tag);

          let variant: 'filtered' | 'pendingRemove' | 'pendingAdd' | 'addable';
          if (existingId !== undefined && !isPendingRm) variant = 'filtered';
          else if (existingId !== undefined && isPendingRm) variant = 'pendingRemove';
          else if (isPendingAd) variant = 'pendingAdd';
          else variant = 'addable';

          return <TagActionsCell tag={record.tag} onToggle={handleToggle} variant={variant} styles={styles} t={t} />;
        },
      },
    ],
    [t, activeHashTag, filteredTagMap, pendingRemove, pendingAdd, handleToggle, onSetHashTag, onClose, cx, styles],
  );

  const modalTitle = useMemo(
    () => (
      <Space>
        <TagsOutlined />
        <span>{t('tags.title')}</span>
        {tagCounts.length > 0 && <span className={styles.titleSecondary}>· {tagCounts.length}</span>}
      </Space>
    ),
    [t, tagCounts.length, styles.titleSecondary],
  );

  const cancelButtonProps = useMemo(
    () => ({ style: { display: isPendingChanges ? undefined : 'none' } as React.CSSProperties }),
    [isPendingChanges],
  );

  const okButtonProps = useMemo(() => ({ loading: isCommitting }), [isCommitting]);

  const paginationConfig = useMemo(
    () => (tagCounts.length > 20 ? { pageSize: 20, showSizeChanger: false, size: 'small' as const } : (false as const)),
    [tagCounts.length],
  );

  const tableLocale = useMemo(() => ({ emptyText: t('tags.empty') }), [t]);

  return (
    <Modal
      open={open}
      title={modalTitle}
      onCancel={onClose}
      onOk={handleOkVoid}
      okText={isPendingChanges ? t('tags.ok_with_changes', { count: totalChanges }) : t('common.close')}
      cancelText={t('common.cancel')}
      cancelButtonProps={cancelButtonProps}
      okButtonProps={okButtonProps}
      width={520}
    >
      <Table
        dataSource={tagCounts}
        columns={columns}
        rowKey="tag"
        size="small"
        pagination={paginationConfig}
        locale={tableLocale}
      />
    </Modal>
  );
}
