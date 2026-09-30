import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, Typography, App, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { api } from '../../api/client';
import type { Word, WordGender, WordPos } from '@shared/types';
import { WordFormModal } from './WordFormModal';

const { Title } = Typography;

interface WordsResponse {
  items: Word[];
  total: number;
  page: number;
  limit: number;
}

// ─── Visual config ────────────────────────────────────────────────────────────

const GENDER_COLORS: Record<WordGender, string> = {
  ma: 'blue',
  mi: 'cyan',
  f: 'pink',
  n: 'default',
};

const POS_COLORS: Record<WordPos, string> = {
  noun: 'gold',
  verb: 'volcano',
  adjective: 'green',
  adverb: 'lime',
  pronoun: 'purple',
  numeral: 'geekblue',
  preposition: 'cyan',
  conjunction: 'magenta',
  interjection: 'orange',
  phrase: 'default',
};

const PAGE_SIZE = 50;

const useStyles = createStyles(({ css, token }) => ({
  pageHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
    flex-wrap: wrap;
  `,
  title: css`
    margin: 0 !important;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  `,
  czechCell: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  listLink: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
    &:hover { color: ${token.colorPrimary}; }
  `,
  grammarCell: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
}));

export function VocabularyPage() {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<WordGender | undefined>(undefined);
  const [pos, setPos] = useState<WordPos | undefined>(undefined);
  const [lesson, setLesson] = useState<number | undefined>(undefined);
  const [lessonInput, setLessonInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editWord, setEditWord] = useState<Word | null>(null);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const buildQS = () => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    if (search) p.set('search', search);
    if (gender) p.set('gender', gender);
    if (pos) p.set('pos', pos);
    if (lesson !== undefined) p.set('lesson', String(lesson));
    return p.toString();
  };

  const { data, isLoading } = useQuery({
    queryKey: ['words', { page, search, gender, pos, lesson }],
    queryFn: () => api.get<WordsResponse>(`/words?${buildQS()}`),
  });

  const { mutate: deleteWord, isPending: isDeleting } = useMutation({
    mutationFn: (id: number) => api.delete<{ success: boolean }>(`/words/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['words'] }); },
    onError: (err: Error) => void message.error(err.message),
  });

  const handlePaginationChange = (pagination: TablePaginationConfig) => setPage(pagination.current ?? 1);

  const handleLessonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLessonInput(e.target.value);
    const num = e.target.value ? parseInt(e.target.value, 10) : undefined;
    setLesson(num && !isNaN(num) ? num : undefined);
    setPage(1);
  };

  // ─── Table columns ────────────────────────────────────────────────────────

  const columns: TableColumnsType<Word> = [
    {
      title: t('words.col_czech'),
      dataIndex: 'czech',
      key: 'czech',
      render: (czech: string, record) => (
        <span className={styles.czechCell}>
          <strong>{czech}</strong>
          {record.seznamUrl && (
            <Tooltip title={t('words.open_seznam')}>
              <a href={record.seznamUrl} target="_blank" rel="noopener noreferrer"
                className={styles.listLink} onClick={(e) => e.stopPropagation()}>
                <LinkOutlined />
              </a>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: t('words.col_russian'),
      dataIndex: 'russian',
      key: 'russian',
    },
    {
      title: t('words.col_pos'),
      key: 'grammar',
      width: 130,
      render: (_: unknown, record: Word) => (
        <span className={styles.grammarCell}>
          {record.pos && (
            <Tag color={POS_COLORS[record.pos]} style={{ marginInlineEnd: 0 }}>
              {t(`words.pos_${record.pos}`)}
            </Tag>
          )}
          {record.pos === 'noun' && record.gender && (
            <Tag color={GENDER_COLORS[record.gender]} style={{ marginInlineEnd: 0 }}>
              {t(`words.gender_${record.gender}`)}
            </Tag>
          )}
          {record.pos === 'verb' && record.aspect && (
            <Tag color={record.aspect === 'perfective' ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>
              {t(`words.aspect_${record.aspect}`)}
            </Tag>
          )}
          {record.pos === 'verb' && record.conjugationClass && (
            <span style={{ fontSize: 11, opacity: 0.65 }}>
              {t(`words.conj_${record.conjugationClass.replace(/-/g, '_').toLowerCase()}`)}
            </span>
          )}
          {record.pos === 'verb' && record.verbPair && (
            <span style={{ fontSize: 11, opacity: 0.7 }}>↔ {record.verbPair}</span>
          )}
          {record.pos === 'noun' && record.declensionClass && (
            <span style={{ fontSize: 11, opacity: 0.65 }}>
              {t(`words.decl_${record.declensionClass}`)}
            </span>
          )}
          {record.pos === 'noun' && record.numberType && (
            <Tag color="default" style={{ marginInlineEnd: 0, fontSize: 11 }}>
              {t(`words.number_${record.numberType}`)}
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: t('words.col_lesson'),
      dataIndex: 'lesson',
      key: 'lesson',
      width: 80,
      render: (l: number | null) => (l != null ? l : '—'),
    },
    {
      title: t('words.col_notes'),
      dataIndex: 'notes',
      key: 'notes',
      render: (n: string | null) => n ?? '—',
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: Word) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setEditWord(record); setModalOpen(true); }} />
          <Popconfirm
            title={t('common.delete') + '?'}
            onConfirm={() => deleteWord(record.id)}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={isDeleting} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className={styles.pageHeader}>
        <Title level={3} className={styles.title}>{t('words.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditWord(null); setModalOpen(true); }}>
          {t('words.add')}
        </Button>
      </div>

      <div className={styles.toolbar}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={t('common.search')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
        <Select<WordPos | undefined>
          placeholder={t('words.col_pos')}
          allowClear
          value={pos}
          onChange={(v) => { setPos(v); setPage(1); }}
          style={{ width: 160 }}
          options={[
            'noun','verb','adjective','adverb','pronoun',
            'numeral','preposition','conjunction','interjection','phrase',
          ].map((p) => ({ value: p, label: t(`words.pos_${p}`) }))}
        />
        <Select<WordGender | undefined>
          placeholder={t('words.col_gender')}
          allowClear
          value={gender}
          onChange={(v) => { setGender(v); setPage(1); }}
          style={{ width: 150 }}
          options={[
            { value: 'ma', label: t('words.gender_ma') },
            { value: 'mi', label: t('words.gender_mi') },
            { value: 'f',  label: t('words.gender_f') },
            { value: 'n',  label: t('words.gender_n') },
          ]}
        />
        <Input
          placeholder={t('words.col_lesson')}
          value={lessonInput}
          onChange={handleLessonChange}
          style={{ width: 90 }}
          type="number"
          min={1}
        />
      </div>

      <Table<Word>
        rowKey="id"
        columns={columns}
        dataSource={data?.items}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showTotal: (total) => `${total}`,
          showSizeChanger: false,
        }}
        onChange={handlePaginationChange}
        size="middle"
      />

      <WordFormModal
        open={modalOpen}
        word={editWord}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

