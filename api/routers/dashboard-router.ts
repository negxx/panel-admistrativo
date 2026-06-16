import { eq, and, sql, count, sum, gte, lte } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

// Helper para obtener fecha local Argentina (YYYY-MM-DD)
function getLocalDate(): string {
  const now = new Date();
  // Argentina es UTC-3, pero para consistencia usamos la fecha del servidor
  return now.toISOString().split("T")[0];
}

// Helper para obtener año-mes actual (YYYY-MM)
function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Helper para obtener año actual
function getCurrentYear(): number {
  return new Date().getFullYear();
}

export const dashboardRouter = createRouter({
  getSummary: publicQuery.query(async () => {
    const db = getDb();
    const currentMonth = getCurrentYearMonth();

    const totalPlayers = await db.select({ count: count() }).from(schema.players)
      .where(eq(schema.players.status, "active"));

    const totalPaid = await db.select({ total: sum(schema.payments.totalAmount) }).from(schema.payments)
      .where(sql`strftime('%Y-%m', ${schema.payments.paymentDate}) = ${currentMonth}`);

    // Deudores: cuotas vencidas (overdue) del mes actual
    const debtors = await db.select({ count: count() }).from(schema.quotas)
      .where(and(
        eq(schema.quotas.status, "overdue"),
        sql`strftime('%Y-%m', ${schema.quotas.dueDate}) = ${currentMonth}`
      ));

    // Ingresos del mes (transacciones tipo income)
    const incomeThisMonth = await db.select({ total: sum(schema.transactions.amount) }).from(schema.transactions)
      .where(and(
        eq(schema.transactions.type, "income"),
        sql`strftime('%Y-%m', ${schema.transactions.date}) = ${currentMonth}`
      ));

    // Egresos del mes (transacciones tipo expense)
    const expenseThisMonth = await db.select({ total: sum(schema.transactions.amount) }).from(schema.transactions)
      .where(and(
        eq(schema.transactions.type, "expense"),
        sql`strftime('%Y-%m', ${schema.transactions.date}) = ${currentMonth}`
      ));

    const totalIncome = Number(incomeThisMonth[0]?.total ?? 0);
    const totalExpense = Number(expenseThisMonth[0]?.total ?? 0);

    return {
      totalPlayers: totalPlayers[0]?.count ?? 0,
      totalCollected: Number(totalPaid[0]?.total ?? 0),
      totalDebtors: debtors[0]?.count ?? 0,
      monthlyIncome: totalIncome,
      monthlyExpense: totalExpense,
      monthlyBalance: totalIncome - totalExpense,
    };
  }),

  getCollectionTrend: publicQuery.query(async () => {
    const db = getDb();
    const year = getCurrentYear();
    
    // Generar meses dinámicamente para el año actual
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return `${year}-${month}`;
    });

    const result = await db.all<{ month: string; expected: number; collected: number }>(`
      WITH months AS (
        ${months.map(m => `SELECT '${m}' as m`).join(" UNION ALL ")}
      )
      SELECT 
        m as month,
        COALESCE((SELECT SUM(totalAmount) FROM quotas WHERE strftime('%Y-%m', dueDate) = m), 0) as expected,
        COALESCE((SELECT SUM(totalAmount) FROM payments WHERE strftime('%Y-%m', paymentDate) = m), 0) as collected
      FROM months
      ORDER BY m
    `);
    return result;
  }),

  getCategoryDistribution: publicQuery.query(async () => {
    const db = getDb();
    const result = await db.select({
      category: schema.players.category,
      count: count(),
    }).from(schema.players)
      .where(eq(schema.players.status, "active"))
      .groupBy(schema.players.category)
      .orderBy(schema.players.category);
    return result;
  }),

  getRecentPayments: publicQuery.query(async () => {
    const db = getDb();
    
    // Pagos de tutores (con guardianId)
    const tutorPayments = await db.select({
      id: schema.payments.id,
      name: schema.guardians.name,
      totalAmount: schema.payments.totalAmount,
      paymentDate: schema.payments.paymentDate,
      paymentMethod: schema.payments.paymentMethod,
      isPlayer: sql<false>`0`,
    }).from(schema.payments)
      .leftJoin(schema.guardians, eq(schema.payments.guardianId, schema.guardians.id))
      .where(sql`${schema.payments.guardianId} IS NOT NULL`);

    // Pagos de jugadores sin tutor (con playerId)
    const playerPayments = await db.select({
      id: schema.payments.id,
      name: schema.players.name,
      totalAmount: schema.payments.totalAmount,
      paymentDate: schema.payments.paymentDate,
      paymentMethod: schema.payments.paymentMethod,
      isPlayer: sql<true>`1`,
    }).from(schema.payments)
      .leftJoin(schema.players, eq(schema.payments.playerId, schema.players.id))
      .where(sql`${schema.payments.playerId} IS NOT NULL`);

    // Combinar y ordenar por fecha
    const allPayments = [...tutorPayments, ...playerPayments]
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
      .slice(0, 10);

    return allPayments.map(p => ({
      id: p.id,
      guardianName: p.name ?? "N/A",
      totalAmount: p.totalAmount,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
    }));
  }),

  getUpcomingDues: publicQuery.query(async () => {
    const db = getDb();
    const now = getLocalDate();
    
    // Calcular 7 días después
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().split("T")[0];

    const result = await db.select({
      id: schema.quotas.id,
      playerName: schema.players.name,
      playerPhone: schema.players.phone,
      guardianPhone: schema.guardians.phone,
      dueDate: schema.quotas.dueDate,
      totalAmount: schema.quotas.totalAmount,
      status: schema.quotas.status,
    }).from(schema.quotas)
      .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
      .where(and(
        eq(schema.quotas.status, "pending"),
        gte(schema.quotas.dueDate, now),
        lte(schema.quotas.dueDate, sevenDaysLaterStr)
      ))
      .limit(20);

    // Para jugadores sin tutor, usar el teléfono del jugador
    return result.map(r => ({
      ...r,
      guardianPhone: r.guardianPhone ?? r.playerPhone ?? null,
    }));
  }),
});