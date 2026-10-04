import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";

const fullSchema = { ...schema, ...relations };

/**
 * Conexión a PostgreSQL (Supabase, a través del pooler).
 *
 * **`DATABASE_URL` tiene que ser el pooler en modo SESIÓN (puerto 5432), no el
 * de modo transacción (puerto 6543).** Los dos multiplexan conexiones —lo que
 * hace falta en serverless para no agotar el límite de Postgres— pero se
 * comportan distinto ante consultas concurrentes:
 *
 * - **Modo sesión (5432)**: cada conexión de la app tiene un backend de
 *   Postgres dedicado mientras dura. Varias consultas en paralelo sobre esa
 *   misma conexión andan bien.
 * - **Modo transacción (6543)**: el backend puede cambiar entre una consulta y
 *   la siguiente. Si la app manda más de una consulta en paralelo por la misma
 *   conexión —y tRPC hace exactamente eso: cualquier pantalla que pida varias
 *   cosas juntas dispara sus resolvers en paralelo—, las respuestas se
 *   desincronizan y la conexión **se cuelga para siempre, sin error ni
 *   timeout**. Así se veían Familias, Socios y el Panel: cargando sin mostrar
 *   nada, y una vez que pasaba dejaba la conexión (y con ella al proceso
 *   entero) inutilizable hasta reiniciar.
 *
 * Verificado a mano: el mismo batch de consultas que se cuelga siempre contra
 * el puerto 6543 anda perfecto contra el 5432, sin importar cuántas conexiones
 * (`max`) se abran.
 *
 *        Puerto 6543 (no usar acá): ...pooler.supabase.com:6543/postgres
 *        Puerto 5432 (usar):        ...pooler.supabase.com:5432/postgres
 *
 * `prepare: false` sigue haciendo falta: aunque el modo sesión sí soporta
 * prepared statements, dejarlo apagado evita sorpresas si la cadena de
 * conexión cambia de modo más adelante.
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
        "(Project Settings → Database → Connection pooling, modo Session, puerto 5432).",
    );
  }
  return url;
}

export function getDb(): Db {
  if (!globalForDb.__clubDb) {
    const sql = postgres(connectionString(), {
      // El pooler no soporta prepared statements.
      prepare: false,

      // Unas pocas conexiones alcanzan para un club de este tamaño; el pooler
      // se encarga de que no sean un problema para Postgres.
      max: 5,

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
