import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";

const fullSchema = { ...schema, ...relations };

/**
 * Conexión a PostgreSQL (Supabase).
 *
 * Dos cosas importantes para que ande bien en Vercel:
 *
 * 1. **Hay que usar el pooler de Supabase**, no la conexión directa. En
 *    serverless cada invocación abre su propia conexión y el límite de Postgres
 *    se agota enseguida. Supabase expone un pooler en el puerto 6543 que
 *    multiplexa todo eso.
 *
 *        Directa (no usar):  ...supabase.com:5432/postgres
 *        Pooler  (usar):     ...pooler.supabase.com:6543/postgres?pgbouncer=true
 *
 * 2. **`prepare: false`** — el pooler trabaja en modo transacción y no soporta
 *    prepared statements. Sin esto, las consultas fallan de forma intermitente
 *    y difícil de diagnosticar.
 *
 * La conexión se guarda en `globalThis` para reutilizarla mientras la instancia
 * sigue viva: Vercel mantiene las funciones "tibias" entre requests y así se
 * evita el costo de reconectar en cada uno.
 */

const globalForDb = globalThis as unknown as {
  __clubSql?: postgres.Sql;
  __clubDb?: Db;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Copiá la cadena de conexión del pooler de Supabase " +
        "(Project Settings → Database → Connection pooling, modo Transaction).",
    );
  }
  return url;
}

export function getDb(): Db {
  if (!globalForDb.__clubDb) {
    const sql = postgres(connectionString(), {
      // El pooler no soporta prepared statements.
      prepare: false,
      // Una conexión por instancia: del resto se encarga el pooler.
      max: 1,

      /**
       * Sin esto, `postgres-js` pide el catálogo de tipos al conectar: un viaje
       * de ida y vuelta extra en cada arranque en frío, que en serverless es
       * justo el momento más caro.
       */
      fetch_types: false,

      /**
       * Vercel congela la función entre invocaciones. Al descongelarla, la
       * conexión guardada puede estar muerta sin que se note, y una consulta
       * sobre un socket muerto **se queda esperando para siempre**.
       *
       * Con estos tiempos la conexión se recicla seguido y, si algo falla, falla
       * rápido y con error en vez de colgarse.
       */
      idle_timeout: 10,
      max_lifetime: 60 * 5,
      connect_timeout: 8,
    });

    globalForDb.__clubSql = sql;
    globalForDb.__clubDb = drizzle(sql, { schema: fullSchema });
  }
  return globalForDb.__clubDb;
}

/** Cierra la conexión. Sólo lo usan los scripts y los tests. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__clubSql) {
    await globalForDb.__clubSql.end();
    globalForDb.__clubSql = undefined;
    globalForDb.__clubDb = undefined;
  }
}

/**
 * Permite inyectar otra conexión. Lo usan los tests para correr contra PGlite
 * en vez de una base real.
 */
export function setDb(db: Db): void {
  globalForDb.__clubDb = db;
}

/**
 * La conexión completa.
 *
 * Se tipa contra la clase base de Postgres en vez de contra el driver concreto
 * para que los tests puedan pasar una base PGlite (Postgres en memoria) a las
 * mismas funciones que en producción reciben la conexión de Supabase.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof fullSchema>;

/** La conexión dentro de una transacción. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Cualquiera de las dos. Las funciones de `api/domain` reciben esto para poder
 * usarse tanto sueltas como dentro de una transacción.
 */
export type DbClient = Db | Tx;
