import type { Channel, Group } from '@shared/types.ts';
import { Form, Input, Modal, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const useStyles = createStyles(({ css }) => ({
  form: css`
    margin-top: 16px;
  `,
}));

/** Same normalization as the server — strips URL prefixes, @, and path suffixes. */
function normalizeTelegramId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];
}

const VALIDATE_TRIGGER = ['onBlur'];
const OK_BTN_DISABLED = { disabled: true };
const OK_BTN_ENABLED = { disabled: false };

interface ChannelFormModalProps {
  open: boolean;
  editingChannel: Channel | null;
  /** Full list of existing channels — used for duplicate validation */
  allChannels: Channel[];
  form: FormInstance;
  groups: Group[];
  lookupLoading: boolean;
  confirmLoading: boolean;
  onClose: () => void;
  onSave: () => void;
  onTelegramIdBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function ChannelFormModal({
  open,
  editingChannel,
  allChannels,
  form,
  groups,
  lookupLoading,
  confirmLoading,
  onClose,
  onSave,
  onTelegramIdBlur,
}: ChannelFormModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const [hasErrors, setHasErrors] = React.useState(false);

  const handleFieldsChange = useCallback(
    (_: unknown, allFields: { errors?: string[] }[]) =>
      setHasErrors(allFields.some((f) => (f.errors?.length ?? 0) > 0)),
    [],
  );

  const telegramIdRules = useMemo(
    () => [
      { required: true, message: t('channels.form.telegram_id_required') },
      {
        validator: (_: unknown, value: string) => {
          if (!value || editingChannel) return Promise.resolve();
          const normalized = normalizeTelegramId(value);
          const dup = allChannels.find((ch) => ch.telegramId.toLowerCase() === normalized.toLowerCase());
          if (dup) return Promise.reject(new Error(t('channels.form.already_exists')));
          return Promise.resolve();
        },
      },
    ],
    [t, editingChannel, allChannels],
  );

  const nameRules = useMemo(() => [{ required: true, message: t('channels.form.name_required') }], [t]);

  const channelTypeOptions = useMemo(
    () => [
      { value: 'news', label: t('channels.form.type_news') },
      { value: 'news_link', label: t('channels.form.type_news_link') },
      { value: 'media', label: t('channels.form.type_media') },
      { value: 'blog', label: t('channels.form.type_blog') },
    ],
    [t],
  );

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: (
          <>
            {/* runtime color from DB — inline style is an accepted exception per AGENTS.md */}
            {/* oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop */}
            <span style={{ color: g.color }}>■</span> {g.name}
          </>
        ),
      })),
    [groups],
  );

  return (
    <Modal
      open={open}
      title={editingChannel ? t('channels.form.title_edit') : t('channels.form.title_add')}
      onCancel={onClose}
      onOk={onSave}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      okButtonProps={hasErrors ? OK_BTN_DISABLED : OK_BTN_ENABLED}
    >
      <Form
        form={form}
        layout="vertical"
        className={styles.form}
        autoComplete="off"
        onFieldsChange={handleFieldsChange}
      >
        <Form.Item
          name="telegramId"
          label={t('channels.form.telegram_id_label')}
          rules={telegramIdRules}
          validateTrigger={VALIDATE_TRIGGER}
        >
          <Input
            placeholder={t('channels.form.telegram_id_placeholder')}
            autoComplete="off"
            onBlur={onTelegramIdBlur}
          />
        </Form.Item>
        <Spin spinning={lookupLoading} size="small">
          <Form.Item name="name" label={t('channels.form.name_label')} rules={nameRules}>
            <Input placeholder={t('channels.form.name_placeholder')} autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label={t('channels.form.description_label')}>
            <Input.TextArea rows={2} placeholder={t('channels.form.description_placeholder')} autoComplete="off" />
          </Form.Item>
        </Spin>
        <Form.Item name="channelType" label={t('channels.form.channel_type_label')} initialValue="news">
          <Select options={channelTypeOptions} />
        </Form.Item>
        <Form.Item name="groupId" label={t('channels.form.group_label')}>
          <Select allowClear placeholder={t('channels.form.group_placeholder')} options={groupOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
