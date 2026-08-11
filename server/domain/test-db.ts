import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";

/**
 * Base Postgres en memoria para los tests, con [PGlite](https://pglite.dev).
 *
 * Es Postgres de verdad compilado a WebAssembly: los tests ejercitan el mismo
 * SQL que corre en Supabase (`to_char`, `ON CONFLICT ... RETURNING`, resta de
 * fechas), sin necesidad de levantar Docker ni de conectarse a la nube.
 *
 * El esquema sale de **los archivos de migración reales**, no de un DDL escrito
 * a mano: si alguien cambia `db/schema.ts` y regenera la migración, los tests
 * usan el esquema nuevo automáticamente. Con un DDL duplicado, los tests podían
 * seguir pasando contra una estructura que ya no existía.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "../../db/migrations");

let cachedDdl: string | null = null;

function migrationSql(): string {
  if (cachedDdl !== null) return cachedDdl;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      "No hay migraciones en db/migrations. Generalas con: npm run db:generate",
    );
  }

  cachedDdl = files
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf-8"))
    // Drizzle separa las sentencias con este marcador; PGlite ejecuta el lote
    // entero, así que alcanza con sacarlo.
    .join("\n")
    .replaceAll("--> statement-breakpoint", "");

  return cachedDdl;
}

/** Crea una base vacía en memoria con el esquema completo. */
export async function createTestDb() {
  const client = new PGlite();
  await client.exec(migrationSql());
  return drizzle(client, { schema: { ...schema, ...relations } });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
