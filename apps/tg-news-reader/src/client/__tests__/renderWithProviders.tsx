import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react';
import type { RenderHookOptions, RenderOptions } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import React from 'react';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

export function createWrapper() {
  const qc = createTestQueryClient();
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ConfigProvider>
          <App>{children}</App>
        </ConfigProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient: qc };
}

export function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const { Wrapper, queryClient } = createWrapper();
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) {
  const { Wrapper, queryClient } = createWrapper();
  return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
}
