import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const sharedRules = {
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'warn',
  // React 19 supports async event handlers natively — don't flag JSX attributes
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'data'] },

  // Base JS rules
  js.configs.recommended,

  // Server — TypeScript strict
  {
    name: 'server',
    files: ['src/server/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.server.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },

  // Scripts — TypeScript strict (separate tsconfig so they don't affect rootDir inference)
  {
    name: 'scripts',
    files: ['scripts/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.scripts.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },

  // Client — TypeScript + React
  {
    name: 'client',
    files: ['src/client/**/*.{ts,tsx}', 'src/shared/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...sharedRules,
    },
  },
);

