import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    // Los mismos alias que usa la app, para que los tests importen igual que
    // el código de producción.
    alias: {
      "@": path.resolve(root, "src"),
      "@contracts": path.resolve(root, "contracts"),
      "@db": path.resolve(root, "db"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],

    /**
     * Los tests de integración levantan un Postgres en memoria (PGlite) y
     * empaquetan módulos: con varios archivos en paralelo, los 5 segundos que
     * trae Vitest por defecto se quedan cortos y fallan por tiempo aunque el
     * código esté bien.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
