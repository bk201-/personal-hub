import { ThemeProvider } from '@personal-hub/browser/ui';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './api/client';
import { AuthGate } from './components/Auth/AuthGate';
import { Dashboard } from './components/Layout/Dashboard';
import { RateLimitBanner } from './components/Layout/RateLimitBanner';
import { VersionBanner } from './components/Layout/VersionBanner';
import './i18n';
import { logger } from './logger';
import { useUIStore } from './store/uiStore';
import './styles.css';

// ─── Global JS error handlers ─────────────────────────────────────────────────

window.addEventListener('error', (e) => {
  if (!e.error) return;
  logger.error(
    { module: 'window', err: e.error as Error, source: e.filename, line: e.lineno },
    `Uncaught error: ${e.message}`,
  );
});

window.addEventListener('unhandledrejection', (e) => {
  logger.error(
    { module: 'window', err: e.reason instanceof Error ? e.reason : String(e.reason) },
    'Unhandled promise rejection',
  );
});

// ─── QueryClient ──────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.observers.some((o) => o.hasListeners())) return;
      logger.warn({ module: 'query', queryKey: query.queryKey, err }, `Query error: ${err.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      logger.warn({ module: 'query', err }, `Mutation error: ${err.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1_000 * Math.pow(2, attempt), 30_000),
    },
  },
});

function ThemedApp() {
  const { i18n } = useTranslation();
  const { isDarkTheme } = useUIStore();
  const isRu = i18n.language.startsWith('ru');
  const antdLocale = isRu ? ruRU : enUS;

  return (
    <ThemeProvider locale={antdLocale} isDark={isDarkTheme} prefix="cj">
      <VersionBanner />
      <RateLimitBanner />
      <AuthGate>
        <Dashboard />
      </AuthGate>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemedApp />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
