import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Modal } from 'antd';
import 'dayjs/locale/en';
import 'dayjs/locale/ru';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApiError } from './api/client';
import { markReadBatcher } from './api/markReadBatcher';
import { App } from './App';
import i18n from './i18n';
import { logger } from './logger';
import { registerMediaServiceWorker } from './services/serviceWorker';
import './styles.css';

registerMediaServiceWorker();

interface VitePreloadErrorEvent extends Event {
  payload?: unknown;
}

let staleChunkModalOpen = false;

function showStaleChunkReloadModal(): void {
  if (staleChunkModalOpen) return;
  staleChunkModalOpen = true;

  Modal.confirm({
    title: i18n.t('common.newVersionAvailable'),
    content: i18n.t('common.newVersionChunkError'),
    okText: i18n.t('common.newVersionReload'),
    cancelText: i18n.t('common.close'),
    onOk: () => window.location.reload(),
    onCancel: () => {
      staleChunkModalOpen = false;
    },
    afterClose: () => {
      staleChunkModalOpen = false;
    },
  });
}

// ─── Global JS error handlers ─────────────────────────────────────────────────

window.addEventListener('vite:preloadError', ((event: VitePreloadErrorEvent) => {
  event.preventDefault();
  logger.info({ module: 'window', err: event.payload }, 'Vite preload error — prompting user to reload');
  showStaleChunkReloadModal();
}) as EventListener);

window.addEventListener('error', (e) => {
  // Filter out resource-load errors (img/script src failures) — they have no `error`
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

// ─── QueryClient with global error reporting ──────────────────────────────────

/** If the error message mentions AUTH_KEY, immediately refetch health so
 *  TelegramSessionBanner appears without waiting for the next 5-min poll. */
function triggerHealthRefetchOnAuthKey(err: Error): void {
  if (err.message.includes('AUTH_KEY')) {
    void queryClient.invalidateQueries({ queryKey: ['health'] });
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      triggerHealthRefetchOnAuthKey(err);
      // Only report queries that have no dedicated onError — avoid double-logging
      if (query.observers.some((o) => o.hasListeners())) return;
      logger.warn({ module: 'query', queryKey: query.queryKey, err }, `Query error: ${err.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      triggerHealthRefetchOnAuthKey(err);
      logger.warn({ module: 'query', err }, `Mutation error: ${err.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry client errors (4xx) — except 429 (rate limit) which is transient
      retry: (failureCount, err) => {
        if (err instanceof ApiError && err.status === 429) return failureCount < 3;
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return failureCount < 3;
      },
      // 429: back off slowly (15s → 30s → 60s); others: 1s → 2s → 4s → 30s cap
      retryDelay: (attempt, err) => {
        if (err instanceof ApiError && err.status === 429) return Math.min(15_000 * Math.pow(2, attempt), 60_000);
        return Math.min(1_000 * Math.pow(2, attempt), 30_000);
      },
    },
  },
});

// On a failed mark-read batch flush, resync the affected news + channel counts
// from the server so optimistic UI can't drift out of sync permanently.
markReadBatcher.setReconciler(() => {
  void queryClient.invalidateQueries({ queryKey: ['news'] });
  void queryClient.invalidateQueries({ queryKey: ['channels'] });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
