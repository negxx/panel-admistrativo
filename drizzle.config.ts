import { defineConfig } from "drizzle-kit";
import "dotenv/config";

/**
 * Configuración de Drizzle Kit.
 *
 * Para generar y aplicar migraciones hay que usar la **conexión directa** de
 * Supabase (puerto 5432), no el pooler: el pooler trabaja en modo transacción y
 * no soporta las sentencias DDL que emite `drizzle-kit`.
 *
 *   DIRECT_URL   → migraciones (puerto 5432)
 *   DATABASE_URL → la aplicación (pooler, puerto 6543)
 */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
