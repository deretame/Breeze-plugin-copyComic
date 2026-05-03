import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "types/runtime-api.typecheck.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["**/*.{ts,js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: false,
      },
    },
    rules: {
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
