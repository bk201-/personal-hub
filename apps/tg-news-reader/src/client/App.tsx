import { ThemeProvider } from '@personal-hub/browser/ui';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
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

  return (
    <ThemeProvider locale={antdLocale} isDark={isDarkTheme} prefix="tgr">
      <AppErrorBoundary>
        <RateLimitBanner />
        <AuthGate>
          <AppLayout />
        </AuthGate>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}
