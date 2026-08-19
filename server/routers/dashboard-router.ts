import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { addDays, currentYear, currentYearMonth, today } from "../lib/dates";
import { syncOverdueQuotas } from "../domain/quotas";

/**
 * Datos del tablero principal.
 *
 * Todas las consultas usan la fecha del club (`api/lib/dates.ts`), no la del
 * servidor en UTC: antes, entre las 21 y las 24 de Argentina, el dashboard ya
 * mostraba los datos del día siguiente.
 *
 * El `strftime()` de SQLite se reemplazó por `to_char()` de Postgres.
 */
export const dashboardRouter = createRouter({
  getSummary: staffProcedure.query(async () => {
    const db = getDb();
    await syncOverdueQuotas(db);

    const month = currentYearMonth();

    const totalPlayers = Number(
      (
        await db
          .select({ count: count() })
          .from(schema.players)
          .where(eq(schema.players.status, "active"))
      )[0]?.count ?? 0,
    );

    // Cobrado del mes: sólo pagos confirmados. Los informados por el portal que
    // todavía no revisó nadie no son plata en el club.
    const collected = (
      await db
        .select({ total: sum(schema.payments.totalAmount) })
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.status, "confirmed"),
            sql`to_char(${schema.payments.paymentDate}, 'YYYY-MM') = ${month}`,
          ),
        )
    )[0];

    // Deuda total acumulada, de todos los meses, no sólo del actual.
    const debt = (
      await db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.quotas.totalAmount}), 0)::integer`,
          quotaCount: count(),
          debtorCount: sql<number>`COUNT(DISTINCT ${schema.quotas.playerId})::integer`,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(
          and(
            sql`${schema.quotas.status} IN ('pending','overdue')`,
            eq(schema.players.status, "active"),
          ),
        )
    )[0];

    const overdue = (
      await db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.quotas.totalAmount}), 0)::integer`,
          debtorCount: sql<number>`COUNT(DISTINCT ${schema.quotas.playerId})::integer`,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(and(eq(schema.quotas.status, "overdue"), eq(schema.players.status, "active")))
    )[0];

    const movements = await db
      .select({ type: schema.transactions.type, total: sum(schema.transactions.amount) })
      .from(schema.transactions)
      .where(sql`to_char(${schema.transactions.date}, 'YYYY-MM') = ${month}`)
      .groupBy(schema.transactions.type);

    const otherIncome = Number(movements.find((m) => m.type === "income")?.total ?? 0);
    const expenses = Number(movements.find((m) => m.type === "expense")?.total ?? 0);
    const totalCollected = Number(collected?.total ?? 0);

    const pendingReview = Number(
      (
        await db
          .select({ count: count() })
          .from(schema.payments)
          .where(eq(schema.payments.status, "pending_review"))
      )[0]?.count ?? 0,
    );

    return {
      totalPlayers,
      /** Cobrado por cuotas en el mes en curso. */
      totalCollected,
      /** Deuda acumulada de socios activos, de todos los períodos. */
      totalDebt: Number(debt?.total ?? 0),
      totalDebtors: Number(overdue?.debtorCount ?? 0),
      pendingQuotaCount: Number(debt?.quotaCount ?? 0),
      overdueAmount: Number(overdue?.total ?? 0),
      /** Cuotas + otros ingresos del mes. */
      monthlyIncome: totalCollected + otherIncome,
      monthlyExpense: expenses,
      monthlyBalance: totalCollected + otherIncome - expenses,
      /** Pagos informados desde el portal esperando confirmación. */
      pendingReviewCount: pendingReview,
    };
  }),

  /** Comparativa mensual de lo esperado contra lo cobrado, del año en curso. */
  getCollectionTrend: staffProcedure.query(async () => {
    const db = getDb();
    const year = currentYear();

    /**
     * Se agrupa por el número de mes y el formato se arma en JavaScript.
     *
     * La versión anterior usaba `make_date(year, month, 1)` en el SELECT pero
     * agrupaba sólo por `month`: Postgres lo rechaza porque `year` no está en el
     * GROUP BY ni dentro de una función de agregación. SQLite lo toleraba, así
     * que el error apareció recién al migrar.
     */
    const expected = await db
      .select({
        month: schema.quotas.month,
        total: sql<number>`COALESCE(SUM(${schema.quotas.totalAmount}), 0)::integer`,
      })
      .from(schema.quotas)
      .where(eq(schema.quotas.year, year))
      .groupBy(schema.quotas.month);

    const collected = await db
      .select({
        month: sql<string>`to_char(${schema.payments.paymentDate}, 'MM')`,
        total: sql<number>`COALESCE(SUM(${schema.payments.totalAmount}), 0)::integer`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.status, "confirmed"),
          sql`EXTRACT(YEAR FROM ${schema.payments.paymentDate}) = ${year}`,
        ),
      )
      .groupBy(sql`to_char(${schema.payments.paymentDate}, 'MM')`);

    const expectedByMonth = new Map(
      expected.map((e) => [String(e.month).padStart(2, "0"), Number(e.total)]),
    );
    const collectedByMonth = new Map(collected.map((c) => [c.month, Number(c.total)]));

    return Array.from({ length: 12 }, (_, i) => {
      const key = String(i + 1).padStart(2, "0");
      return {
        month: `${year}-${key}`,
        expected: expectedByMonth.get(key) ?? 0,
        collected: collectedByMonth.get(key) ?? 0,
      };
    });
  }),

  getCategoryDistribution: staffProcedure.query(async () => {
    const db = getDb();
    return db
      .select({ category: schema.players.category, count: count() })
      .from(schema.players)
      .where(eq(schema.players.status, "active"))
      .groupBy(schema.players.category)
      .orderBy(schema.players.category);
  }),

  /**
   * Últimos pagos.
   *
   * Antes se hacían dos consultas completas (una por tutores y otra por socios
   * sin tutor), se traía **toda** la tabla de pagos a memoria y recién ahí se
   * ordenaba y se cortaba en 10. Ahora es una sola consulta con LIMIT.
   */
  getRecentPayments: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.payments.id,
        guardianName: schema.guardians.name,
        playerName: schema.players.name,
        totalAmount: schema.payments.totalAmount,
        paymentDate: schema.payments.paymentDate,
        paymentMethod: schema.payments.paymentMethod,
        status: schema.payments.status,
        source: schema.payments.source,
        receiptNumber: schema.payments.receiptNumber,
      })
      .from(schema.payments)
      .leftJoin(schema.guardians, eq(schema.payments.guardianId, schema.guardians.id))
      .leftJoin(schema.players, eq(schema.payments.playerId, schema.players.id))
      .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.id))
      .limit(10);

    return rows.map((p) => ({
      ...p,
      payerName: p.guardianName ?? p.playerName ?? "Sin identificar",
    }));
  }),

  /** Cuotas que vencen en los próximos 7 días, para llamar antes de que caigan en mora. */
  getUpcomingDues: staffProcedure.query(async () => {
    const db = getDb();
    const from = today();
    const to = addDays(from, 7);

    const rows = await db
      .select({
        id: schema.quotas.id,
        playerName: schema.players.name,
        playerPhone: schema.players.phone,
        guardianName: schema.guardians.name,
        guardianPhone: schema.guardians.phone,
        dueDate: schema.quotas.dueDate,
        totalAmount: schema.quotas.totalAmount,
        status: schema.quotas.status,
      })
      .from(schema.quotas)
      .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
      .where(
        and(
          eq(schema.quotas.status, "pending"),
          eq(schema.players.status, "active"),
          gte(schema.quotas.dueDate, from),
          lte(schema.quotas.dueDate, to),
        ),
      )
      .orderBy(schema.quotas.dueDate)
      .limit(20);

    return rows.map((row) => ({
      ...row,
      // Para socios sin tutor vale el teléfono propio.
      contactName: row.guardianName ?? row.playerName,
      contactPhone: row.guardianPhone ?? row.playerPhone ?? null,
    }));
  }),
});
