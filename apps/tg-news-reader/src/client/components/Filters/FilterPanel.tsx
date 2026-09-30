import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Filter } from '@shared/types.ts';
import { Button, Divider, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels, useUpdateChannel } from '../../api/channels';
import { useCreateFilter, useDeleteFilter, useFilters, useFilterStats, useUpdateFilter } from '../../api/filters';
import { useUIStore } from '../../store/uiStore';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  description: css`
    margin-bottom: 16px;
  `,
  forwardRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillAlter};
  `,
  forwardText: css`
    display: flex;
    flex-direction: column;
    flex: 1;
  `,
  form: css`
    margin-bottom: 16px;
  `,
  formType: css`
    width: 120px;
  `,
  formField: css`
    flex: 1;
  `,
  divider: css`
    margin: 8px 0;
  `,
  metaText: css`
    font-size: 11px;
  `,
  statTag: css`
    cursor: default;
    margin: 0;
  `,
}));

const ICON_DELETE = <DeleteOutlined />;
const ICON_PLUS = <PlusOutlined />;
const REQUIRED_RULE = [{ required: true }];

/** Switch cell — stable change handler bound to the row's filter. */
function ActiveSwitch({ filter, onToggle }: { filter: Filter; onToggle: (f: Filter, v: boolean) => void }) {
  const handleChange = useCallback((v: boolean) => onToggle(filter, v), [onToggle, filter]);
  return <Switch checked={filter.isActive === 1} size="small" onChange={handleChange} />;
}

/** Delete cell — stable click handler bound to the row's filter. */
function DeleteButton({ filter, onDelete }: { filter: Filter; onDelete: (f: Filter) => void }) {
  const handleClick = useCallback(() => onDelete(filter), [onDelete, filter]);
  return <Button icon={ICON_DELETE} size="small" type="text" danger onClick={handleClick} />;
}

interface FilterPanelProps {
  channelId: number;
}

export function FilterPanel({ channelId }: FilterPanelProps) {
  const { filterPanelOpen, setFilterPanelOpen } = useUIStore();
  const { data: filters = [] } = useFilters(channelId);
  const { data: stats = [] } = useFilterStats(channelId);
  const { data: channels = [] } = useChannels();
  const channel = useMemo(() => channels.find((c) => c.id === channelId), [channels, channelId]);
  const updateChannel = useUpdateChannel();
  const statsMap = useMemo(() => new Map(stats.map((s) => [s.filterId, s])), [stats]);
  const createFilter = useCreateFilter(channelId);
  const updateFilter = useUpdateFilter(channelId);
  const deleteFilter = useDeleteFilter(channelId);
  const [form] = Form.useForm();
  const { t } = useTranslation();
  const { styles } = useStyles();

  const handleToggleForwards = useCallback(
    (checked: boolean) => {
      updateChannel.mutate({ id: channelId, filterForwards: checked ? 1 : 0 });
    },
    [updateChannel, channelId],
  );

  const handleAdd = useCallback(async () => {
    const values = (await form.validateFields()) as { name: string; type: 'tag' | 'keyword'; value: string };
    await createFilter.mutateAsync(values);
    form.resetFields();
  }, [form, createFilter]);

  const handleToggle = useCallback(
    (f: Filter, isActive: boolean) => {
      updateFilter.mutate({ id: f.id, isActive: isActive ? 1 : 0 });
    },
    [updateFilter],
  );

  const handleDelete = useCallback(
    (f: Filter) => {
      Modal.confirm({
        title: t('filters.delete_confirm_title', { name: f.name }),
        okText: t('common.delete'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: () => deleteFilter.mutateAsync(f.id),
      });
    },
    [t, deleteFilter],
  );

  const handleCloseModal = useCallback(() => setFilterPanelOpen(false), [setFilterPanelOpen]);

  const typeOptions = useMemo(
    () => [
      { value: 'tag', label: t('filters.type_tag') },
      { value: 'keyword', label: t('filters.type_keyword') },
    ],
    [t],
  );

  const nameRules = useMemo(() => [{ required: true, message: t('common.none') }], [t]);
  const valueRules = useMemo(() => [{ required: true, message: t('common.none') }], [t]);

  const paginationConfig = useMemo(
    () => (filters.length > 20 ? { pageSize: 20, showSizeChanger: false, size: 'small' as const } : (false as const)),
    [filters.length],
  );

  const tableLocale = useMemo(() => ({ emptyText: t('filters.empty') }), [t]);

  const columns = useMemo(
    () => [
      {
        title: t('filters.col_name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record: Filter) => (
          <Space>
            <Tag color={record.type === 'tag' ? 'blue' : 'green'}>{record.type === 'tag' ? '#' : '🔤'}</Tag>
            <Text>{name}</Text>
            <Text type="secondary" className={styles.metaText}>
              ({record.value})
            </Text>
          </Space>
        ),
      },
      {
        title: t('filters.col_active'),
        dataIndex: 'isActive',
        key: 'isActive',
        width: 80,
        render: (_isActive: number, record: Filter) => <ActiveSwitch filter={record} onToggle={handleToggle} />,
      },
      {
        title: t('filters.col_hits'),
        key: 'stats',
        width: 70,
        defaultSortOrder: 'descend' as const,
        sorter: (a: Filter, b: Filter) => {
          const aTotal = statsMap.get(a.id)?.hitsTotal ?? 0;
          const bTotal = statsMap.get(b.id)?.hitsTotal ?? 0;
          return aTotal - bTotal;
        },
        render: (_: unknown, record: Filter) => {
          const s = statsMap.get(record.id);
          const hits7 = s?.hitsLast7 ?? 0;
          const total = s?.hitsTotal ?? 0;
          const tip =
            total > 0
              ? `${t('filters.stats_7d', { count: hits7 })} · ${t('filters.stats_total', { count: total })}${s?.lastHitDate ? ` · ${s.lastHitDate}` : ''}`
              : t('filters.stats_never');
          return (
            <Tooltip title={tip}>
              <Tag color={total > 0 ? 'blue' : undefined} className={styles.statTag}>
                {total}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: '',
        key: 'actions',
        width: 40,
        render: (_: unknown, record: Filter) => <DeleteButton filter={record} onDelete={handleDelete} />,
      },
    ],
    [t, statsMap, handleToggle, handleDelete, styles.metaText, styles.statTag],
  );

  return (
    <Modal open={filterPanelOpen} title={t('filters.title')} onCancel={handleCloseModal} footer={null} width={680}>
      <div className={styles.description}>
        <Text type="secondary">{t('filters.description')}</Text>
      </div>

      <div className={styles.forwardRow}>
        <Switch
          checked={channel?.filterForwards === 1}
          onChange={handleToggleForwards}
          loading={updateChannel.isPending}
        />
        <div className={styles.forwardText}>
          <Text strong>{t('filters.filter_forwards_label')}</Text>
          <Text type="secondary" className={styles.metaText}>
            {t('filters.filter_forwards_desc')}
          </Text>
        </div>
      </div>

      <Form form={form} layout="inline" className={styles.form}>
        <Form.Item name="type" initialValue="tag" rules={REQUIRED_RULE}>
          <Select className={styles.formType} options={typeOptions} />
        </Form.Item>
        <Form.Item name="name" rules={nameRules} className={styles.formField}>
          <Input placeholder={t('filters.name_placeholder')} />
        </Form.Item>
        <Form.Item name="value" rules={valueRules} className={styles.formField}>
          <Input placeholder={t('filters.value_placeholder')} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={ICON_PLUS} onClick={handleAdd} loading={createFilter.isPending}>
            {t('filters.add')}
          </Button>
        </Form.Item>
      </Form>

      <Divider className={styles.divider} />

      <Table
        dataSource={filters}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={paginationConfig}
        locale={tableLocale}
      />
    </Modal>
  );
}
