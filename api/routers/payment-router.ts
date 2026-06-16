import { z } from "zod";
import { eq, and, sql, count, sum } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const paymentRouter = createRouter({
  list: publicQuery.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    guardianId: z.number().optional(),
    method: z.string().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(25),
  })).query(async ({ input }) => {
    const db = getDb();
    const { dateFrom, dateTo, guardianId, method, page, pageSize } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (dateFrom) conditions.push(sql`${schema.payments.paymentDate} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${schema.payments.paymentDate} <= ${dateTo}`);
    if (guardianId) conditions.push(eq(schema.payments.guardianId, guardianId));
    if (method) conditions.push(eq(schema.payments.paymentMethod, method as "cash" | "transfer" | "mercadopago"));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await db.select({ count: count() }).from(schema.payments).where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const payments = await db.select({
      id: schema.payments.id,
      guardianId: schema.payments.guardianId,
      guardianName: schema.guardians.name,
      totalAmount: schema.payments.totalAmount,
      paymentDate: schema.payments.paymentDate,
      paymentMethod: schema.payments.paymentMethod,
      receiptNumber: schema.payments.receiptNumber,
      notes: schema.payments.notes,
    }).from(schema.payments)
      .leftJoin(schema.guardians, eq(schema.payments.guardianId, schema.guardians.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${schema.payments.paymentDate} DESC`);

    return { payments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }),

  getById: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const payment = await db.select().from(schema.payments)
      .where(eq(schema.payments.id, input.id))
      .limit(1);
    if (!payment[0]) return null;

    const quotas = await db.select({
      quotaId: schema.paymentQuotas.quotaId,
      playerName: schema.players.name,
      month: schema.quotas.month,
      year: schema.quotas.year,
      totalAmount: schema.quotas.totalAmount,
    }).from(schema.paymentQuotas)
      .leftJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
      .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .where(eq(schema.paymentQuotas.paymentId, input.id));

    return { ...payment[0], quotas };
  }),

  register: publicQuery.input(z.object({
    guardianId: z.number(),
    quotaIds: z.array(z.number()),
    paymentMethod: z.enum(["cash", "transfer", "mercadopago"]),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { guardianId, quotaIds, paymentMethod, notes } = input;

    // Get quotas and calculate total
    const quotasToPay = await db.select().from(schema.quotas)
      .where(sql`${schema.quotas.id} IN (${quotaIds.join(",")})`);

    const totalAmount = quotasToPay.reduce((sum, q) => sum + q.totalAmount, 0);
    const today = new Date().toISOString().split("T")[0];

    // Generate receipt number
    const receiptCount = await db.select({ count: count() }).from(schema.payments)
      .where(sql`strftime('%Y-%m', ${schema.payments.paymentDate}) = strftime('%Y-%m', 'now')`);
    const receiptNumber = `R-${new Date().getFullYear()}-${String((receiptCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    // Create payment
    const paymentResult = await db.insert(schema.payments).values({
      guardianId,
      totalAmount,
      paymentDate: today,
      paymentMethod,
      receiptNumber,
      notes,
    }).returning();


    
    const paymentId = paymentResult[0].id;

    // Link quotas and mark as paid
    for (const quotaId of quotaIds) {
      await db.insert(schema.paymentQuotas).values({ paymentId, quotaId });
      await db.update(schema.quotas)
        .set({ status: "paid", paymentDate: today, paymentMethod })
        .where(eq(schema.quotas.id, quotaId));
    }
    // Actualizar cierre de caja del día (solo si es efectivo)
      if (paymentMethod === "cash") {
     try {
      const closure = await db.select().from(schema.dailyClosures)
      .where(and(
        eq(schema.dailyClosures.date, today),
        eq(schema.dailyClosures.status, "open")
      ))
      .limit(1);

      if (closure[0]) {
      await db.update(schema.dailyClosures)
        .set({ 
          cashSales: (closure[0].cashSales || 0) + totalAmount,
          totalIncome: (closure[0].totalIncome || 0) + totalAmount
        })
        .where(eq(schema.dailyClosures.id, closure[0].id));
        }
      } catch (e) {
      // Silenciar error de caja - el pago sigue funcionando igual
      }
    }
    return { payment: paymentResult[0] };
  }),

  registerFamily: publicQuery.input(z.object({
    guardianId: z.number(),
    playerSelections: z.array(z.object({
      playerId: z.number(),
      quotaIds: z.array(z.number()),
    })),
    paymentMethod: z.enum(["cash", "transfer", "mercadopago"]),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { guardianId, playerSelections, paymentMethod, notes } = input;

    const allQuotaIds: number[] = [];
    for (const sel of playerSelections) {
      allQuotaIds.push(...sel.quotaIds);
    }

    const quotasToPay = await db.select().from(schema.quotas)
      .where(sql`${schema.quotas.id} IN (${allQuotaIds.join(",")})`);

    const totalAmount = quotasToPay.reduce((sum, q) => sum + q.totalAmount, 0);
    const today = new Date().toISOString().split("T")[0];

    const receiptCount = await db.select({ count: count() }).from(schema.payments)
      .where(sql`strftime('%Y-%m', ${schema.payments.paymentDate}) = strftime('%Y-%m', 'now')`);
    const receiptNumber = `R-${new Date().getFullYear()}-${String((receiptCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const paymentResult = await db.insert(schema.payments).values({
      guardianId,
      totalAmount,
      paymentDate: today,
      paymentMethod,
      receiptNumber,
      notes,
    }).returning();

    const paymentId = paymentResult[0].id;

    for (const quotaId of allQuotaIds) {
      await db.insert(schema.paymentQuotas).values({ paymentId, quotaId });
      await db.update(schema.quotas)
        .set({ status: "paid", paymentDate: today, paymentMethod })
        .where(eq(schema.quotas.id, quotaId));
    }

    return { payment: paymentResult[0] };
  }),

  getStatsByGuardian: publicQuery.input(z.object({ guardianId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const totalPaid = await db.select({ total: sum(schema.payments.totalAmount) })
      .from(schema.payments)
      .where(eq(schema.payments.guardianId, input.guardianId));
    return { totalPaid: Number(totalPaid[0]?.total ?? 0) };
  }),
});
