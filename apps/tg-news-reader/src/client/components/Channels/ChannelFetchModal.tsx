import { DatePicker, Modal } from 'antd';
import { createStyles } from 'antd-style';
import type dayjs from 'dayjs';
import React from 'react';
import { useTranslation } from 'react-i18next';

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    margin-top: 16px;
  `,
  datePicker: css`
    width: 100%;
  `,
  hint: css`
    margin-top: 8px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
}));

interface ChannelFetchModalProps {
  open: boolean;
  fetchSince: dayjs.Dayjs | null;
  loading: boolean;
  onChangeSince: (val: dayjs.Dayjs | null) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ChannelFetchModal({
  open,
  fetchSince,
  loading,
  onChangeSince,
  onClose,
  onConfirm,
}: ChannelFetchModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  return (
    <Modal
      open={open}
      title={t('channels.fetch_modal.title')}
      onCancel={onClose}
      onOk={onConfirm}
      okText={t('channels.fetch_modal.ok_text')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
    >
      <div className={styles.body}>
        <p>{t('channels.fetch_modal.label')}</p>
        <DatePicker
          showTime
          value={fetchSince}
          onChange={onChangeSince}
          placeholder={t('channels.fetch_modal.date_placeholder')}
          className={styles.datePicker}
          format="DD.MM.YYYY HH:mm"
        />
        <p className={styles.hint}>{t('channels.fetch_modal.hint')}</p>
      </div>
    </Modal>
  );
}
