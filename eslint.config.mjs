import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // Build output and generated dirs are never linted.
  { ignores: ['out/**', 'dist/**', 'release/**'] },

  // Base recommended JS rules.
  js.configs.recommended,

  // Type-aware TypeScript rules. The project service resolves each file to its
  // leaf tsconfig (tsconfig.node.json / tsconfig.web.json) the way the editor does.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Renderer: browser globals + React hooks/refresh rules.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node-side TypeScript (main, preload, shared, tests, root config files).
  {
    files: ['src/main/**', 'src/preload/**', 'src/shared/**', 'tests/**', '*.config.{ts,mts}'],
    languageOptions: { globals: globals.node },
  },

  // Plain JS/MJS/CJS (this config, scripts/*.mjs): no type info, node globals.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Disable any lint rule that overlaps with Prettier. MUST be last.
  prettier,
)
