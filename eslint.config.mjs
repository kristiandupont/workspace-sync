import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tseslint },
    rules: { ...tseslint.configs.recommended.rules },
  },
  {
    files: ["src/**/__tests__/**/*.ts", "src/**/__tests__/**/*.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];
