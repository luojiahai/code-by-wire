import path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default tseslint.config(
  // Source the ignore list straight from .gitignore so lint never touches build
  // output (out/, dist/, release/) or local-only scratch (.agents/, .superpowers/,
  // docs/superpowers/, docs/deck/, vendored skills). Prettier already reads
  // .gitignore by default; this keeps ESLint in lockstep with it.
  includeIgnoreFile(gitignorePath),

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
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Node-side TypeScript (main, preload, shared, tests, root config files).
  {
    files: [
      "src/main/**",
      "src/preload/**",
      "src/shared/**",
      "tests/**",
      "*.config.{ts,mts}",
    ],
    languageOptions: { globals: globals.node },
  },

  // Plain JS/MJS/CJS (this config, scripts/*.mjs): no type info, node globals.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // The Claude transcript JSONL parsers in src/main/provider/claude/ read an external,
  // Claude-controlled format via JSON.parse (typed `any`). Member access on those values
  // trips the no-unsafe-* family, and the explicit `any` is load-bearing (switching to
  // `unknown` cascades into tsc errors). Typing that schema is tracked as a follow-up;
  // until then these are warnings, not errors, so the gate stays green and honest.
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Disable any lint rule that overlaps with Prettier. MUST be last.
  prettier,
);
