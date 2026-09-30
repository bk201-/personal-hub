import { App as AntApp, ConfigProvider, theme } from 'antd';
import { StyleProvider } from 'antd-style';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthGate } from './components/Auth/AuthGate';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { RateLimitBanner } from './components/common/RateLimitBanner';
import { AppLayout } from './components/Layout/AppLayout';
import { useUIStore } from './store/uiStore';

export function App() {
  const { isDarkTheme } = useUIStore();
  const { i18n } = useTranslation();
  const isRu = i18n.language.startsWith('ru');
  const antdLocale = isRu ? ruRU : enUS;

  // Keep dayjs locale in sync with UI language
  dayjs.locale(isRu ? 'ru' : 'en');

  const antdTheme = useMemo(
    () => ({
      algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm,
      cssVar: { prefix: 'tgr' },
      hashed: false,
    }),
    [isDarkTheme],
  );

  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      <StyleProvider>
        <AntApp>
          <AppErrorBoundary>
            <RateLimitBanner />
            <AuthGate>
              <AppLayout />
            </AuthGate>
          </AppErrorBoundary>
        </AntApp>
      </StyleProvider>
    </ConfigProvider>
  );
}
