import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DbClient } from "../queries/connection";

/**
 * Cierre de caja.
 *
 * Antes los totales del cierre se acumulaban de a poco: cada pago hacía
 * `cashSales = cashSales + monto`. Eso traía dos problemas graves:
 *
 *  - Si el pago se cargaba con la caja cerrada (o sin abrir), el importe se
 *    perdía y no aparecía en ningún lado.
 *  - Si después se editaba o borraba un pago, el acumulado quedaba mal para
 *    siempre, sin forma de detectarlo.
 *
 * Ahora los totales se **recalculan desde los datos reales** del día cada vez
 * que algo cambia. El cierre pasa a ser una foto derivada, no un contador.
 */

export type CashTotals = {
  /** Cuotas cobradas en efectivo (pagos confirmados). */
  cashSales: number;
  transferSales: number;
  mpSales: number;
  /** Ingresos cargados a mano en Ingresos y Egresos. */
  otherIncome: number;
  /** De esos ingresos manuales, los que entraron en efectivo. */
  otherCashIncome: number;
  totalIncome: number;
  totalExpenses: number;
  /** Egresos pagados en efectivo: los únicos que bajan la plata del cajón. */
  cashExpenses: number;
};

/** Suma todo lo que pasó en un día, sin tocar la tabla de cierres. */
export async function calculateDayTotals(db: DbClient, date: string): Promise<CashTotals> {
  const byMethod = await db
    .select({
      method: schema.payments.paymentMethod,
      total: sql<number>`COALESCE(SUM(${schema.payments.totalAmount}), 0)::integer`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.paymentDate, date),
        // Los pagos "a confirmar" del portal todavía no son plata en el club.
        eq(schema.payments.status, "confirmed"),
      ),
    )
    .groupBy(schema.payments.paymentMethod);

  const sales = { cash: 0, transfer: 0, mercadopago: 0 };
  for (const row of byMethod) {
    if (row.method in sales) sales[row.method as keyof typeof sales] = Number(row.total);
  }

  const movements = await db
    .select({
      type: schema.transactions.type,
      method: schema.transactions.method,
      total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)::integer`,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.date, date))
    .groupBy(schema.transactions.type, schema.transactions.method);

  let otherIncome = 0;
  let otherCashIncome = 0;
  let totalExpenses = 0;
  let cashExpenses = 0;

  for (const row of movements) {
    const amount = Number(row.total);
    if (row.type === "income") {
      otherIncome += amount;
      if (row.method === "cash") otherCashIncome += amount;
    } else {
      totalExpenses += amount;
      if (row.method === "cash") cashExpenses += amount;
    }
  }

  return {
    cashSales: sales.cash,
    transferSales: sales.transfer,
    mpSales: sales.mercadopago,
    otherIncome,
    otherCashIncome,
    totalIncome: sales.cash + sales.transfer + sales.mercadopago + otherIncome,
    totalExpenses,
    cashExpenses,
  };
}

/**
 * Efectivo que debería haber en el cajón.
 *
 * `apertura + cobros en efectivo + ingresos manuales en efectivo − egresos en
 * efectivo`. La versión anterior no restaba los egresos, así que cualquier gasto
 * pagado en efectivo hacía figurar un faltante que no existía.
 */
export function expectedCashFor(openingAmount: number, totals: CashTotals): number {
  return openingAmount + totals.cashSales + totals.otherCashIncome - totals.cashExpenses;
}

/**
 * Recalcula y guarda los totales del cierre de un día.
 *
 * No hace nada si ese día no tiene cierre abierto ni cerrado — así se puede
 * llamar siempre, sin preguntar antes. Los cierres ya cerrados también se
 * actualizan (por si se corrige un pago de una fecha vieja), pero conservan el
 * efectivo contado y recalculan la diferencia.
 */
export async function refreshClosure(db: DbClient, date: string): Promise<void> {
  const closure = (
    await db
      .select()
      .from(schema.dailyClosures)
      .where(eq(schema.dailyClosures.date, date))
      .limit(1)
  )[0];

  if (!closure) return;

  const totals = await calculateDayTotals(db, date);
  const expectedCash = expectedCashFor(closure.openingAmount, totals);

  await db
    .update(schema.dailyClosures)
    .set({
      cashSales: totals.cashSales,
      transferSales: totals.transferSales,
      mpSales: totals.mpSales,
      otherIncome: totals.otherIncome,
      totalIncome: totals.totalIncome,
      totalExpenses: totals.totalExpenses,
      cashExpenses: totals.cashExpenses,
      expectedCash,
      // Sólo tiene sentido comparar contra lo contado si la caja ya se cerró.
      difference: closure.status === "closed" ? closure.actualCash - expectedCash : 0,
    })
    .where(eq(schema.dailyClosures.id, closure.id));
}
