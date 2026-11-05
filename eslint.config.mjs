import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier/flat";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "src/generated/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      ".local/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@next/next": next, "react-hooks": hooks },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      ...hooks.configs.recommended.rules,
    },
  },
  prettier,
);
