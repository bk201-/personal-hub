import { LockOutlined } from '@ant-design/icons';
import type { Group } from '@shared/types.ts';
import { Input, Modal, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const OTP_STYLES = { root: { justifyContent: 'center' as const }, input: { width: 56, height: 56, fontSize: 24 } };

const useStyles = createStyles(({ css, token }, color?: string) => ({
  body: css`
    margin-top: 16px;
    text-align: center;
  `,
  lockIcon: css`
    margin-right: 8px;
    color: ${color ?? token.colorPrimary};
  `,
  pinError: css`
    display: block;
    margin-top: 8px;
  `,
}));

interface GroupPinModalProps {
  open: boolean;
  pinTarget: Group | null;
  pinValue: string;
  pinError: string;
  confirmLoading: boolean;
  onClose: () => void;
  /** Called on manual OK click (no arg) or auto-submit with the completed PIN value */
  onConfirm: (pin?: string) => void;
  onPinChange: (val: string) => void;
}

export function GroupPinModal({
  open,
  pinTarget,
  pinValue,
  pinError,
  confirmLoading,
  onClose,
  onConfirm,
  onPinChange,
}: GroupPinModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles(pinTarget?.color);

  const modalTitle = useMemo(
    () => (
      <span>
        <LockOutlined className={styles.lockIcon} />
        {t('groups.pin_modal.title', { name: pinTarget?.name })}
      </span>
    ),
    [styles.lockIcon, t, pinTarget?.name],
  );

  const handleAfterOpen = useCallback(
    (visible: boolean) => {
      if (visible) onPinChange('');
    },
    [onPinChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
    },
    [onConfirm],
  );

  const handleOtpChange = useCallback(
    (val: string) => {
      onPinChange(val);
      if (val.length === 4) onConfirm(val);
    },
    [onPinChange, onConfirm],
  );

  const handleOkClick = useCallback(() => onConfirm(), [onConfirm]);

  return (
    <Modal
      open={open}
      title={modalTitle}
      onCancel={onClose}
      onOk={handleOkClick}
      okText={t('groups.pin_modal.ok_text')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      afterOpenChange={handleAfterOpen}
    >
      <div className={styles.body} onKeyDown={handleKeyDown}>
        <Input.OTP length={4} autoFocus value={pinValue} onChange={handleOtpChange} styles={OTP_STYLES} />
        {pinError && (
          <Text type="danger" className={styles.pinError}>
            {pinError}
          </Text>
        )}
      </div>
    </Modal>
  );
}
