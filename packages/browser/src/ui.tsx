import { MoonOutlined, SunOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, App, Button, ConfigProvider, Dropdown, Layout, theme } from 'antd';
import type { ConfigProviderProps, MenuProps } from 'antd';
import { createStyles, StyleProvider } from 'antd-style';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import type { ComponentProps, ComponentRef, ReactNode } from 'react';

const useStyles = createStyles(({ css, token }, compact: boolean) => ({
  header: css`
    display: flex;
    align-items: center;
    background: ${token.colorPrimary};
    padding: ${compact ? '0 12px' : '0 24px'};
    gap: ${compact ? '8px' : '12px'};
  `,
  actions: css`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  iconButton: css`
    color: ${token.colorTextLightSolid};
    flex-shrink: 0;
  `,
  languages: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  languageLabel: css`
    margin-right: 4px;
  `,
  languageButton: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
  rateLimit: css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  `,
}));

export function HeaderBar({
  children,
  actions,
  compact = false,
}: {
  children: ReactNode;
  actions: ReactNode;
  compact?: boolean;
}) {
  const { styles } = useStyles(compact);
  return (
    <Layout.Header className={styles.header}>
      {children}
      <div className={styles.actions}>{actions}</div>
    </Layout.Header>
  );
}

// Forward the ref and event handlers so application-specific tooltip wrappers keep working.
export const ThemeToggle = forwardRef<
  ComponentRef<typeof Button>,
  Omit<ComponentProps<typeof Button>, 'icon'> & {
    isDark: boolean;
    lightLabel: string;
    darkLabel: string;
  }
>(function ThemeToggle({ isDark, lightLabel, darkLabel, className, ...props }, ref) {
  const { styles, cx } = useStyles(false);
  return (
    <Button
      {...props}
      ref={ref}
      type="text"
      icon={isDark ? <SunOutlined /> : <MoonOutlined />}
      aria-label={isDark ? lightLabel : darkLabel}
      className={cx(styles.iconButton, className)}
    />
  );
});

export function UserMenu({ items, label }: { items: MenuProps['items']; label: string }) {
  const { styles } = useStyles(false);
  const menu = useMemo(() => ({ items }), [items]);
  return (
    <Dropdown menu={menu} placement="bottomRight" trigger={['click']}>
      <Button type="text" icon={<UserOutlined />} aria-label={label} className={styles.iconButton} />
    </Dropdown>
  );
}

export function LanguageSwitcher({
  label,
  value,
  languages,
  onChange,
}: {
  label: string;
  value: string;
  languages: readonly { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
}) {
  const { styles } = useStyles(false);
  return (
    <div className={styles.languages} onClick={(event) => event.stopPropagation()}>
      <span className={styles.languageLabel}>{label}:</span>
      {languages.map((language) => (
        <Button
          key={language.value}
          size="small"
          className={styles.languageButton}
          type={value === language.value ? 'primary' : 'default'}
          onClick={(event) => {
            event.stopPropagation();
            onChange(language.value);
          }}
        >
          {language.label}
        </Button>
      ))}
    </div>
  );
}

export function ThemeProvider({
  children,
  isDark,
  prefix,
  locale,
}: {
  children: ReactNode;
  isDark: boolean;
  prefix: string;
  locale?: ConfigProviderProps['locale'];
}) {
  const config = useMemo(
    () => ({
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      cssVar: { prefix },
      hashed: false,
    }),
    [isDark, prefix],
  );
  return (
    <ConfigProvider locale={locale} theme={config}>
      <StyleProvider>
        <App>{children}</App>
      </StyleProvider>
    </ConfigProvider>
  );
}

export function RateLimitBanner({
  until,
  onExpired,
  message,
  description,
}: {
  until: number | null;
  onExpired: () => void;
  message: (seconds: number) => string;
  description: string;
}) {
  const { styles } = useStyles(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (until === null) return;
    const initialTime = Date.now();
    setNow(initialTime);
    if (initialTime >= until) {
      onExpired();
      return;
    }
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) {
        window.clearInterval(timer);
        onExpired();
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [until, onExpired]);
  const seconds = until === null ? 0 : Math.ceil(Math.max(0, until - now) / 1_000);
  if (!seconds) return null;
  return (
    <Alert
      className={styles.rateLimit}
      type="warning"
      icon={<ThunderboltOutlined />}
      showIcon
      banner
      title={message(seconds)}
      description={description}
    />
  );
}
