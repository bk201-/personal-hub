import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import type { AuthUser } from '../../store/authStore';

const { Title, Text } = Typography;

const ICON_MAIL = <MailOutlined />;
const ICON_LOCK = <LockOutlined />;
const ICON_SAFE = <SafetyCertificateOutlined />;

const useStyles = createStyles(({ css }) => ({
  page: css`
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  `,
  card: css`
    width: 100%;
    max-width: 400px;
  `,
  spaceVertical: css`
    width: 100%;
  `,
  cardHeader: css`
    text-align: center;
  `,
  emoji: css`
    font-size: 40px;
  `,
  title: css`
    margin: 8px 0 4px;
  `,
  passwordField: css`
    margin-bottom: 24px;
  `,
  submitField: css`
    margin-bottom: 0;
  `,
  totpActions: css`
    width: 100%;
    justify-content: space-between;
  `,
}));

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const { styles } = useStyles();
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [totpCode, setTotpCode] = useState('');
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<LoginFormValues>();
  const { t } = useTranslation();

  const handleBack = useCallback(() => {
    setStep('credentials');
    setError(null);
  }, []);

  const emailRules = useMemo(
    () => [{ required: true, type: 'email' as const, message: t('auth.email_required') }],
    [t],
  );
  const passwordRules = useMemo(() => [{ required: true, message: t('auth.password_required') }], [t]);

  const doLogin = useCallback(
    async (email: string, password: string, totpCodeVal?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, ...(totpCodeVal ? { totpCode: totpCodeVal } : {}) }),
        });

        const data = (await res.json()) as {
          accessToken?: string;
          user?: AuthUser;
          error?: string;
          requiresTOTP?: boolean;
        };

        if (!res.ok) {
          if (data.requiresTOTP) {
            setPending({ email, password });
            setStep('totp');
            setError(null);
          } else {
            setError(data.error ?? 'Login failed');
          }
          return;
        }

        setAuth(data.accessToken!, data.user!);
      } finally {
        setLoading(false);
      }
    },
    [setAuth],
  );

  const handleCredentials = useCallback(
    async (values: LoginFormValues) => {
      await doLogin(values.email, values.password);
    },
    [doLogin],
  );

  const handleTOTP = useCallback(async () => {
    if (!pending) return;
    await doLogin(pending.email, pending.password, totpCode);
  }, [pending, totpCode, doLogin]);

  return (
    <div className={styles.page}>
      <Card className={styles.card} variant="outlined">
        <Space vertical className={styles.spaceVertical} size={24}>
          <div className={styles.cardHeader}>
            <span className={styles.emoji}>📰</span>
            <Title level={3} className={styles.title}>
              TG News Reader
            </Title>
            <Text type="secondary">{step === 'credentials' ? t('auth.sign_in') : t('auth.two_fa')}</Text>
          </div>

          {error && <Alert type="error" title={error} showIcon />}

          {step === 'credentials' ? (
            <Form form={form} layout="vertical" onFinish={handleCredentials} autoComplete="off">
              <Form.Item name="email" rules={emailRules}>
                <Input
                  prefix={ICON_MAIL}
                  placeholder={t('auth.email_placeholder')}
                  autoComplete="username"
                  size="large"
                />
              </Form.Item>
              <Form.Item name="password" rules={passwordRules} className={styles.passwordField}>
                <Input.Password
                  prefix={ICON_LOCK}
                  placeholder={t('auth.password_placeholder')}
                  autoComplete="current-password"
                  size="large"
                />
              </Form.Item>
              <Form.Item className={styles.submitField}>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  {t('auth.login_button')}
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <Space vertical className={styles.spaceVertical} size={16}>
              <Text>{t('auth.totp_prompt')}</Text>
              <Input.OTP length={6} value={totpCode} onChange={setTotpCode} size="large" />
              <Space className={styles.totpActions}>
                <Button onClick={handleBack}>{t('auth.back')}</Button>
                <Button
                  type="primary"
                  icon={ICON_SAFE}
                  onClick={handleTOTP}
                  loading={loading}
                  disabled={totpCode.length < 6}
                  size="large"
                >
                  {t('auth.confirm_totp')}
                </Button>
              </Space>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
}
