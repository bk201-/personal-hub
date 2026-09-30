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
      port: 5173,
      host: '127.0.0.1',
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3173',
          changeOrigin: true,
        },
      },
    },
    preview: { port: 4173, host: '127.0.0.1', strictPort: true },
    build: {
      outDir: 'dist/client',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // React runtime — меняется редко, кешируется надолго
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
            // Ant Design + rc-* компоненты + antd-style — самый тяжёлый блок
            if (
              id.includes('/antd/') ||
              id.includes('/@ant-design/') ||
              id.includes('/antd-style/') ||
              id.includes('/node_modules/rc-')
            )
              return 'antd';
            // Всё остальное из node_modules
            return 'vendor';
          },
        },
      },
    },
  };
});
