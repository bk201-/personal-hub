import { Alert, Button, Flex, Input, Modal, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

const useStyles = createStyles(({ css }) => ({
  qrContainer: css`
    text-align: center;
  `,
  qrImg: css`
    width: 200px;
    height: 200px;
  `,
  loadingContainer: css`
    text-align: center;
    padding: 40px;
  `,
}));

interface TotpSetupModalProps {
  open: boolean;
  onClose: () => void;
}

export function TotpSetupModal({ open, onClose }: TotpSetupModalProps) {
  const { updateUser } = useAuthStore();
  const { t } = useTranslation();
  const { styles } = useStyles();

  const [step, setStep] = useState<'scan' | 'confirm'>('scan');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQr = useCallback(async () => {
    setStep('scan');
    setCode('');
    setError(null);
    setFetchError(null);
    setQr(null);
    setSecret(null);
    try {
      const data = await api.get<{ qrCode: string; secret: string }>('/auth/totp/setup');
      setQr(data.qrCode);
      setSecret(data.secret);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : t('common.retry'));
    }
  }, [t]);

  const handleAfterOpen = useCallback(
    (visible: boolean) => {
      if (visible) void fetchQr();
    },
    [fetchQr],
  );

  const handleConfirm = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/totp/confirm', { secret, code });
      updateUser({ hasTOTP: true });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.retry'));
    } finally {
      setLoading(false);
    }
  }, [secret, code, updateUser, onClose, t]);

  const handleFetchQr = fetchQr;
  const handleGoConfirm = useCallback(() => setStep('confirm'), []);
  const handleGoScan = useCallback(() => setStep('scan'), []);

  const retryAction = useMemo(
    () => (
      <Button size="small" onClick={handleFetchQr}>
        {t('common.retry')}
      </Button>
    ),
    [handleFetchQr, t],
  );

  return (
    <Modal
      open={open}
      title={t('auth.totp_setup.title')}
      onCancel={onClose}
      afterOpenChange={handleAfterOpen}
      footer={null}
      width={440}
    >
      {step === 'scan' ? (
        <Flex vertical gap={16}>
          <Text>{t('auth.totp_setup.scan_prompt')}</Text>
          {fetchError ? (
            <Alert type="error" description={fetchError} showIcon action={retryAction} />
          ) : qr ? (
            <div className={styles.qrContainer}>
              <img src={qr} alt="TOTP QR Code" className={styles.qrImg} />
            </div>
          ) : (
            <div className={styles.loadingContainer}>
              <Spin />
            </div>
          )}
          <Button type="primary" block onClick={handleGoConfirm} disabled={!qr}>
            {t('auth.totp_setup.scanned_button')}
          </Button>
        </Flex>
      ) : (
        <Flex vertical gap={16}>
          <Text>{t('auth.totp_setup.confirm_prompt')}</Text>
          <Input.OTP length={6} value={code} onChange={setCode} size="large" />
          {error && <Alert type="error" description={error} showIcon />}
          <Flex justify="space-between">
            <Button onClick={handleGoScan}>{t('auth.totp_setup.back')}</Button>
            <Button type="primary" onClick={handleConfirm} loading={loading} disabled={code.length < 6}>
              {t('auth.totp_setup.enable_button')}
            </Button>
          </Flex>
        </Flex>
      )}
    </Modal>
  );
}
