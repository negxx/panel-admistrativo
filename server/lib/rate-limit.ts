import { eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DbClient } from "../queries/connection";

/**
 * Limitador de intentos, persistido en la base.
 *
 * Protege el login del panel y la verificación de PIN del portal. Un PIN de 4
 * dígitos son 10.000 combinaciones: sin esto se prueban todas en segundos.
 *
 * Antes el contador vivía en memoria, lo cual alcanzaba con un único servidor.
 * En Vercel cada request puede tocar una instancia nueva, así que un contador en
 * memoria **no limita nada**: se guarda en la tabla `login_attempts`.
 */

export type RateLimitOptions = {
  /** Intentos fallidos permitidos dentro de la ventana. */
  limit: number;
  /** Largo de la ventana, en milisegundos. */
  windowMs: number;
  /** Cuánto dura el bloqueo al superar el límite, en milisegundos. */
  blockMs: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Consulta si una clave puede seguir intentando. No cuenta el intento:
 * llamá a `registerFailure` sólo cuando el intento efectivamente falla, así los
 * ingresos correctos no consumen cupo.
 */
export async function checkRateLimit(
  db: DbClient,
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = new Date();
  const entry = (
    await db
      .select()
      .from(schema.loginAttempts)
      .where(eq(schema.loginAttempts.key, key))
      .limit(1)
  )[0];

  if (!entry) return { allowed: true, remaining: options.limit };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.blockedUntil.getTime() - now.getTime()) / 1000),
    };
  }

  if (entry.resetAt <= now) {
    await clearAttempts(db, key);
    return { allowed: true, remaining: options.limit };
  }

  return { allowed: true, remaining: Math.max(0, options.limit - entry.count) };
}

/**
 * Registra un intento fallido. Bloquea la clave si se pasó del límite.
 *
 * Se resuelve en una sola sentencia para que dos intentos simultáneos no se
 * pisen: el `ON CONFLICT DO UPDATE` toma el candado de la fila.
 */
export async function registerFailure(
  db: DbClient,
  key: string,
  options: RateLimitOptions,
): Promise<void> {
  const now = Date.now();
  const windowEnd = new Date(now + options.windowMs).toISOString();
  const blockEnd = new Date(now + options.blockMs).toISOString();

  // Dentro de `ON CONFLICT DO UPDATE`, las columnas sin calificar se refieren a
  // la fila que ya estaba: por eso las expresiones comparan contra el valor
  // guardado y no contra el que se intentó insertar.
  //
  // Las fechas van con `::timestamptz` explícito porque, dentro de un fragmento
  // SQL, Postgres no puede deducir el tipo de un parámetro suelto.
  const stored = schema.loginAttempts;
  const windowExpired = sql`${stored.resetAt} <= NOW()`;
  const reachedLimit = sql`${stored.count} + 1 >= ${options.limit}`;

  await db
    .insert(stored)
    .values({ key, count: 1, resetAt: new Date(windowEnd), blockedUntil: null })
    .onConflictDoUpdate({
      target: stored.key,
      set: {
        count: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${stored.count} + 1 END`,
        resetAt: sql`CASE
          WHEN ${windowExpired} THEN ${windowEnd}::timestamptz
          WHEN ${reachedLimit}  THEN ${blockEnd}::timestamptz
          ELSE ${stored.resetAt}
        END`,
        blockedUntil: sql`CASE
          WHEN NOT ${windowExpired} AND ${reachedLimit} THEN ${blockEnd}::timestamptz
          ELSE NULL
        END`,
      },
    });
}

/** Limpia los intentos de una clave. Se llama después de un ingreso exitoso. */
export async function clearAttempts(db: DbClient, key: string): Promise<void> {
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, key));
}

/**
 * Borra los registros vencidos. Lo llama el cron de mantenimiento para que la
 * tabla no crezca sin control.
 */
export async function purgeExpiredAttempts(db: DbClient): Promise<number> {
  const removed = await db
    .delete(schema.loginAttempts)
    .where(sql`"resetAt" < NOW() AND ("blockedUntil" IS NULL OR "blockedUntil" < NOW())`)
    .returning({ key: schema.loginAttempts.key });
  return removed.length;
}

/** Config para el login del panel: 8 intentos por minuto, 10 minutos de bloqueo. */
export const LOGIN_LIMIT: RateLimitOptions = {
  limit: 8,
  windowMs: 60_000,
  blockMs: 10 * 60_000,
};

/** Config para el PIN del portal: 5 intentos por minuto, 15 minutos de bloqueo. */
export const PIN_LIMIT: RateLimitOptions = {
  limit: 5,
  windowMs: 60_000,
  blockMs: 15 * 60_000,
};
