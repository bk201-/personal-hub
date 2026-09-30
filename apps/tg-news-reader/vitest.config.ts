import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/client/**/*.test.ts', 'src/client/**/*.test.tsx'],
          setupFiles: ['src/client/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 60,
        statements: 70,
      },
      exclude: [
        // Server: infrastructure / side-effect-heavy (no unit-testable logic)
        'src/server/index.ts',
        'src/server/db/{migrate,schema}.ts',
        'src/server/services/{telegram,telegramApi,telegramClient,telegramBridge}.ts',
        'src/server/services/{downloadManager,DownloadCoordinator,channelFetchService}.ts',
        'src/server/middleware/{cors,rateLimit}.ts',

        // Client: visual-only .tsx components (Ant Design wrappers, no business logic)
        // Hooks (use*.ts) and utils (*Utils.ts) inside components/ are NOT excluded — they have tests
        // NOTE: tsx excludes removed — coverage now includes all component files

        // Client: entry / side-effect modules
        'src/client/{App,main,i18n,logger}.{ts,tsx}',
        'src/client/{styles.css,vite-env.d.ts}',

        // Test infrastructure
        '**/*.test.{ts,tsx}',
        'src/server/__tests__/**',
        'src/client/test-setup.ts',
      ],
    },
  },
});
