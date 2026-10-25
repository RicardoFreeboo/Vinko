// ESLint 9 (flat config) — config MÍNIMA y coherente para Next 15 / React 19 / TS
// (B5 de la tarea de infra). El objetivo no es imponer un estilo nuevo sobre un
// código ya escrito, sino cazar errores de bulto (variables sin usar, imports
// rotos, dependencias de hooks mal puestas) y bloquear el merge cuando aparezcan.
// Las reglas se amplían con el tiempo; hoy están calibradas para pasar en verde.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  {
    // No tiene sentido lintar lo generado, lo vendido ni la web legacy.
    ignores: [
      ".next/**", "node_modules/**", "out/**", "dist/**",
      "legacy-web-v1/**", "public/**", "next-env.d.ts",
      "tsconfig.tsbuildinfo", "supabase/functions/**", // Deno: runtime y tipos aparte
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Variables sin usar: error, pero tolerando el convenio _ y los args de cola.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      // `any` es un aviso, no un bloqueo: el código existente lo usa y migrarlo
      // es otra tarea; que no frene los merges, pero que quede a la vista.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Scripts y tests de Node: solo globals de Node.
    files: ["scripts/**", "tests/**"],
    languageOptions: { globals: { ...globals.node } },
  },
);
