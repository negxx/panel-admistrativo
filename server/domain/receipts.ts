import { sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DbClient } from "../queries/connection";

/**
 * Numeración de recibos.
 *
 * El número anterior salía de contar los pagos del mes en curso pero se
 * formateaba con el año (`R-2026-0007`): al cambiar de mes el contador volvía a
 * empezar y se repetían números. Además dos cajas cobrando al mismo tiempo leían
 * el mismo total y generaban el mismo recibo.
 *
 * Ahora hay un contador por año en `receipt_sequences`, y se incrementa con una
 * **única sentencia atómica**: el `INSERT ... ON CONFLICT DO UPDATE` toma el
 * candado de la fila, así que dos cobros simultáneos se serializan solos y cada
 * uno se lleva un número distinto.
 */

/**
 * Reserva y devuelve el próximo número de recibo del año.
 * **Tiene que llamarse dentro de una transacción.**
 */
export async function nextReceiptNumber(db: DbClient, year: number): Promise<string> {
  // Se usa el query builder en vez de `db.execute` a propósito: el resultado de
  // `execute` tiene forma distinta según el driver (postgres-js devuelve un
  // array, PGlite un objeto con `.rows`), mientras que `.returning()` es igual
  // en los dos. Así el mismo código corre en Supabase y en los tests.
  const rows = await db
    .insert(schema.receiptSequences)
    .values({ year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: schema.receiptSequences.year,
      set: { lastNumber: sql`${schema.receiptSequences.lastNumber} + 1` },
    })
    .returning({ lastNumber: schema.receiptSequences.lastNumber });

  const number = Number(rows[0]?.lastNumber ?? 1);
  return formatReceiptNumber(year, number);
}

/** `R-2026-0042`. Exportado aparte para poder testear el formato. */
export function formatReceiptNumber(year: number, number: number): string {
  return `R-${year}-${String(number).padStart(4, "0")}`;
}
