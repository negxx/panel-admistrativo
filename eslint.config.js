import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist",
    "node_modules",
    "data",
    // Componentes generados por shadcn/ui. Son código de librería copiado tal
    // cual: no los mantenemos nosotros y sus avisos de Fast Refresh son
    // inherentes al patrón que usa la librería.
    "src/components/ui/**",
  ]),

  // Frontend: corre en el navegador.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Permite descartar campos con `const { pin: _pin, ...resto } = fila`,
      // que es como se evita filtrar datos sensibles en las respuestas.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },

  // Backend y scripts: corren en Node, no hay React ni DOM.
  {
    files: ["api/**/*.ts", "server/**/*.ts", "db/**/*.ts", "scripts/**/*.mjs", "*.config.{ts,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },

  // Los archivos de configuración de Tailwind y PostCSS usan `require`, que es
  // lo que espera su cargador.
  {
    files: ["tailwind.config.js", "postcss.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
