import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { appBuildIdentity } from '../../scripts/buildIdentity';
import pkg from './package.json';

export default defineConfig(({ command }) => {
  const identity = appBuildIdentity(pkg.name, command);
  return {
    plugins: [react(), identity.plugin],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_ID__: JSON.stringify(identity.buildId),
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, './src/shared'),
        '@client': path.resolve(__dirname, './src/client'),
      },
    },
    server: {
      port: 5174,
      host: '127.0.0.1',
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3174',
          changeOrigin: true,
        },
      },
    },
    preview: { port: 4174, host: '127.0.0.1', strictPort: true },
    build: {
      outDir: 'dist/client',
    },
  };
});
