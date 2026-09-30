import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, InputNumber, App, Divider } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { Word, WordPos, WordGender, WordAspect, WordNumber, WordDeclensionClass, WordConjugationClass } from '@shared/types';

type WordSource = 'textbook' | 'manual';

interface WordFormValues {
  czech: string;
  russian: string;
  pos?: WordPos | null;
  gender?: WordGender | null;
  numberType?: WordNumber | null;
  declensionClass?: WordDeclensionClass | null;
  aspect?: WordAspect | null;
  verbPair?: string | null;
  conjugationClass?: WordConjugationClass | null;
  notes?: string;
  lesson?: number;
  source?: WordSource;
}

interface Props {
  open: boolean;
  word?: Word | null;
  onClose: () => void;
}

const POS_OPTIONS: WordPos[] = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'numeral', 'preposition', 'conjunction', 'interjection', 'phrase',
];

const DECLENSION_VALUES: WordDeclensionClass[] = [
  'pan', 'muz', 'soudce', 'predseda',
  'hrad', 'stroj',
  'zena', 'ruze', 'pisen', 'kost',
  'mesto', 'more', 'kure', 'staveni',
];

const CONJUGATION_VALUES: WordConjugationClass[] = [
  'I-nese', 'I-bere', 'I-maze', 'I-pece',
  'II-tiskne',
  'III-kryje', 'III-kupuje',
  'IV-prosi', 'IV-trpi', 'IV-sazi',
  'V-dela',
];

export function WordFormModal({ open, word, onClose }: Props) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<WordFormValues>();
  const queryClient = useQueryClient();
  const isEdit = !!word;

  // Translated options (re-computed on language change)
  const declensionOptions = DECLENSION_VALUES.map((v) => ({
    value: v,
    label: t(`words.decl_${v}`),
  }));
  const conjugationOptions = CONJUGATION_VALUES.map((v) => ({
    value: v,
    label: t(`words.conj_${v.replace(/-/g, '_').toLowerCase()}`),
  }));

  // Reactive POS value to show/hide fields
  const posValue = Form.useWatch('pos', form);

  useEffect(() => {
    if (open) {
      if (word) {
        form.setFieldsValue({
          czech: word.czech,
          russian: word.russian,
          pos: word.pos ?? undefined,
          gender: word.gender ?? undefined,
          numberType: word.numberType ?? undefined,
          declensionClass: word.declensionClass ?? undefined,
          aspect: word.aspect ?? undefined,
          verbPair: word.verbPair ?? undefined,
          conjugationClass: word.conjugationClass ?? undefined,
          notes: word.notes ?? undefined,
          lesson: word.lesson ?? undefined,
          source: word.source ?? undefined,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, word, form]);

  const { mutate: createWord, isPending: isCreating } = useMutation({
    mutationFn: (data: WordFormValues) => api.post<Word>('/words', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['words'] });
      void message.success(t('common.save'));
      onClose();
    },
    onError: (err: Error) => void message.error(err.message),
  });

  const { mutate: updateWord, isPending: isUpdating } = useMutation({
    mutationFn: (data: WordFormValues) => api.patch<Word>(`/words/${word!.id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['words'] });
      void message.success(t('common.save'));
      onClose();
    },
    onError: (err: Error) => void message.error(err.message),
  });

  const handleOk = () => {
    void form.validateFields().then((values) => {
      const payload: WordFormValues = {
        ...values,
        pos: values.pos ?? null,
        gender: values.pos === 'noun' ? (values.gender ?? null) : null,
        numberType: values.pos === 'noun' ? (values.numberType ?? null) : null,
        declensionClass: values.pos === 'noun' ? (values.declensionClass ?? null) : null,
        aspect: values.pos === 'verb' ? (values.aspect ?? null) : null,
        verbPair: values.pos === 'verb' ? (values.verbPair?.trim() || null) : null,
        conjugationClass: values.pos === 'verb' ? (values.conjugationClass ?? null) : null,
        notes: values.notes?.trim() || undefined,
      };
      if (isEdit) updateWord(payload);
      else createWord(payload);
    });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('words.form_title_edit') : t('words.form_title_add')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={isCreating || isUpdating}
      destroyOnHidden
      width={500}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

        {/* ─── Base fields ─────────────────────────────────────────────────── */}
        <Form.Item
          name="czech"
          label={t('words.col_czech')}
          rules={[{ required: true, message: t('words.czech_required') }]}
        >
          <Input autoFocus />
        </Form.Item>

        <Form.Item
          name="russian"
          label={t('words.col_russian')}
          rules={[{ required: true, message: t('words.russian_required') }]}
        >
          <Input />
        </Form.Item>

        <Form.Item name="pos" label={t('words.col_pos')}>
          <Select allowClear placeholder="—">
            {POS_OPTIONS.map((p) => (
              <Select.Option key={p} value={p}>
                {t(`words.pos_${p}`)}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* ─── Noun fields ─────────────────────────────────────────────────── */}
        {posValue === 'noun' && (
          <>
            <Divider style={{ margin: '8px 0 12px' }} />
            <Form.Item name="gender" label={t('words.col_gender')}>
              <Select allowClear placeholder="—">
                <Select.Option value="ma">{t('words.gender_ma')} (pan, pes)</Select.Option>
                <Select.Option value="mi">{t('words.gender_mi')} (stůl, hrad)</Select.Option>
                <Select.Option value="f">{t('words.gender_f')} (žena, růže)</Select.Option>
                <Select.Option value="n">{t('words.gender_n')} (město, moře)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="declensionClass" label={t('words.col_declension')}>
              <Select allowClear placeholder="—" showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={declensionOptions} />
            </Form.Item>

            <Form.Item name="numberType" label={t('words.col_number_type')}>
              <Select allowClear placeholder={t('common.none')}>
                <Select.Option value="singular">{t('words.number_singular')} (mléko)</Select.Option>
                <Select.Option value="plural">{t('words.number_plural')} (nůžky, vrata)</Select.Option>
              </Select>
            </Form.Item>
          </>
        )}

        {/* ─── Verb fields ─────────────────────────────────────────────────── */}
        {posValue === 'verb' && (
          <>
            <Divider style={{ margin: '8px 0 12px' }} />
            <Form.Item name="aspect" label={t('words.col_aspect')}>
              <Select allowClear placeholder="—">
                <Select.Option value="imperfective">{t('words.aspect_imperfective')} (dělat)</Select.Option>
                <Select.Option value="perfective">{t('words.aspect_perfective')} (udělat)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="conjugationClass" label={t('words.col_conjugation')}>
              <Select allowClear placeholder="—" showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={conjugationOptions} />
            </Form.Item>

            <Form.Item name="verbPair" label={t('words.col_verb_pair')}>
              <Input placeholder="párový sloveso" />
            </Form.Item>
          </>
        )}

        {/* ─── Common optional fields ───────────────────────────────────────── */}
        <Divider style={{ margin: '8px 0 12px' }} />

        <Form.Item name="lesson" label={t('words.col_lesson')}>
          <InputNumber min={1} max={999} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="notes" label={t('words.col_notes')}>
          <Input />
        </Form.Item>

        <Form.Item name="source" label="Source">
          <Select allowClear placeholder="—">
            <Select.Option value="textbook">{t('words.source_textbook')}</Select.Option>
            <Select.Option value="manual">{t('words.source_manual')}</Select.Option>
          </Select>
        </Form.Item>

      </Form>
    </Modal>
  );
}
