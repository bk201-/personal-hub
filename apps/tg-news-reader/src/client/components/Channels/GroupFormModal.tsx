import { UnlockOutlined } from '@ant-design/icons';
import type { Group } from '@shared/types.ts';
import { Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRESET_COLORS } from './groupFormConstants';
import type { GroupFormValues } from './groupFormConstants';

const useStyles = createStyles(({ css }) => ({
  form: css`
    margin-top: 16px;
  `,
  colorPicker: css`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  `,
  colorDot: css`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  `,
  pinInput: css`
    letter-spacing: 0.3em;
  `,
  removePinLabel: css`
    display: flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
  `,
}));

interface GroupFormModalProps {
  open: boolean;
  editingGroup: Group | null;
  form: FormInstance<GroupFormValues>;
  selectedColor: string;
  onColorChange: (color: string) => void;
  confirmLoading: boolean;
  onClose: () => void;
  onSave: () => void;
}

/** Single color swatch — stable click handler + memoized style. */
function ColorSwatch({
  color,
  selected,
  className,
  onClick,
}: {
  color: string;
  selected: boolean;
  className: string;
  onClick: (color: string) => void;
}) {
  const handleClick = useCallback(() => onClick(color), [onClick, color]);
  const style = useMemo(
    () => ({
      background: color,
      border: selected ? `3px solid rgba(0,0,0,0.35)` : '3px solid transparent',
      boxShadow: selected ? `0 0 0 2px ${color}` : 'none',
    }),
    [color, selected],
  );
  return <div className={className} onClick={handleClick} style={style} />;
}

export function GroupFormModal({
  open,
  editingGroup,
  form,
  selectedColor,
  onColorChange,
  confirmLoading,
  onClose,
  onSave,
}: GroupFormModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const [colorBorder, setColorBorder] = useState(selectedColor);

  const handleColorClick = useCallback(
    (c: string) => {
      setColorBorder(c);
      onColorChange(c);
    },
    [onColorChange],
  );

  const handleAfterOpen = useCallback(
    (visible: boolean) => {
      if (visible) setColorBorder(selectedColor);
    },
    [selectedColor],
  );

  const handleRemovePinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => form.setFieldValue('removePin', e.target.checked),
    [form],
  );

  const nameRules = useMemo(() => [{ required: true, message: t('groups.form.name_required') }], [t]);
  const pinRules = useMemo(
    () => [{ pattern: /^\d{4}$/, message: t('groups.form.pin_pattern'), warningOnly: false }],
    [t],
  );

  return (
    <Modal
      open={open}
      title={editingGroup ? t('groups.form.title_edit') : t('groups.form.title_add')}
      onCancel={onClose}
      onOk={onSave}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      afterOpenChange={handleAfterOpen}
    >
      <Form form={form} layout="vertical" className={styles.form}>
        <Form.Item name="name" label={t('groups.form.name_label')} rules={nameRules}>
          <Input placeholder={t('groups.form.name_placeholder')} autoComplete="off" />
        </Form.Item>

        <Form.Item label={t('groups.form.color_label')}>
          <div className={styles.colorPicker}>
            {PRESET_COLORS.map((c) => (
              <ColorSwatch
                key={c}
                color={c}
                selected={colorBorder === c}
                className={styles.colorDot}
                onClick={handleColorClick}
              />
            ))}
          </div>
        </Form.Item>

        <Form.Item
          name="pin"
          label={editingGroup?.hasPIN ? t('groups.form.pin_label_existing') : t('groups.form.pin_label_new')}
          rules={pinRules}
        >
          <Input.Password
            placeholder="1234"
            maxLength={4}
            autoComplete="new-password"
            inputMode="numeric"
            className={styles.pinInput}
          />
        </Form.Item>

        {editingGroup?.hasPIN && (
          <Form.Item name="removePin" valuePropName="checked">
            <label className={styles.removePinLabel}>
              <input type="checkbox" onChange={handleRemovePinChange} />
              <UnlockOutlined />
              {t('groups.form.remove_pin')}
            </label>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
