import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { isValidDate } from "../lib/dates";
import { refreshClosure } from "../domain/cash";

const dateSchema = z.string().refine(isValidDate, "Fecha inválida (usá AAAA-MM-DD)");

/**
 * Ingresos y egresos que no son cuotas: alquiler del buffet, sueldos, compra de
 * pelotas, rifas, etc. Las cuotas viven en `payments` y no se duplican acá.
 *
 * Cada alta, edición o baja recalcula el cierre de caja del día afectado, así el
 * arqueo siempre refleja los movimientos reales.
 */
export const transactionRouter = createRouter({
  list: staffProcedure
    .input(
      z.object({
        dateFrom: dateSchema.optional(),
        dateTo: dateSchema.optional(),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const { dateFrom, dateTo, type, category, page, pageSize } = input;

      const conditions = [];
      if (dateFrom) conditions.push(sql`${schema.transactions.date} >= ${dateFrom}`);
      if (dateTo) conditions.push(sql`${schema.transactions.date} <= ${dateTo}`);
      if (type) conditions.push(eq(schema.transactions.type, type));
      if (category) conditions.push(eq(schema.transactions.category, category));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = Number(
        (await db.select({ count: count() }).from(schema.transactions).where(where))[0]?.count ?? 0,
      );

      const transactions = await db
        .select({
          id: schema.transactions.id,
          type: schema.transactions.type,
          category: schema.transactions.category,
          description: schema.transactions.description,
          amount: schema.transactions.amount,
          date: schema.transactions.date,
          method: schema.transactions.method,
          createdByName: schema.localUsers.name,
        })
        .from(schema.transactions)
        .leftJoin(schema.localUsers, eq(schema.transactions.createdBy, schema.localUsers.id))
        .where(where)
        .orderBy(desc(schema.transactions.date), desc(schema.transactions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        transactions,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),

  getSummary: staffProcedure
    .input(z.object({ dateFrom: dateSchema.optional(), dateTo: dateSchema.optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [];
      if (input.dateFrom) conditions.push(sql`${schema.transactions.date} >= ${input.dateFrom}`);
      if (input.dateTo) conditions.push(sql`${schema.transactions.date} <= ${input.dateTo}`);
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          type: schema.transactions.type,
          total: sum(schema.transactions.amount),
        })
        .from(schema.transactions)
        .where(where)
        .groupBy(schema.transactions.type);

      const totalIncome = Number(rows.find((r) => r.type === "income")?.total ?? 0);
      const totalExpense = Number(rows.find((r) => r.type === "expense")?.total ?? 0);

      return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
    }),

  /**
   * Ingresos y egresos de los últimos 6 meses.
   * `to_char` reemplaza al `strftime` de SQLite.
   */
  getMonthlyTrend: staffProcedure.query(async () => {
    const db = getDb();
    const month = sql<string>`to_char(${schema.transactions.date}, 'YYYY-MM')`;

    return db
      .select({
        month,
        income: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type} = 'income'  THEN ${schema.transactions.amount} ELSE 0 END), 0)::integer`,
        expense: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.type} = 'expense' THEN ${schema.transactions.amount} ELSE 0 END), 0)::integer`,
      })
      .from(schema.transactions)
      .where(sql`${schema.transactions.date} >= (CURRENT_DATE - INTERVAL '6 months')`)
      .groupBy(month)
      .orderBy(month);
  }),

  /** Categorías ya usadas, para autocompletar el formulario. */
  categories: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ category: schema.transactions.category })
      .from(schema.transactions)
      .orderBy(schema.transactions.category);
    return rows.map((r) => r.category);
  }),

  create: staffProcedure
    .input(
      z.object({
        type: z.enum(["income", "expense"]),
        category: z.string().trim().min(1, "Poné una categoría").max(60),
        description: z.string().trim().min(1, "Poné una descripción").max(200),
        amount: z.number().int().min(1, "El importe tiene que ser mayor a cero"),
        date: dateSchema,
        method: z.enum(["cash", "transfer", "mercadopago"]).default("cash"),
        attachmentUrl: z.string().trim().url().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const created = (
          await tx
            .insert(schema.transactions)
            // `createdBy` sale de la sesión. Antes se guardaba siempre `null` y no
            // había forma de saber quién había cargado un gasto.
            .values({ ...input, createdBy: ctx.user.source === "local" ? ctx.user.id : null })
            .returning()
        )[0];

        await refreshClosure(tx, input.date);
        return created;
      });
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().trim().min(1).max(60).optional(),
        description: z.string().trim().min(1).max(200).optional(),
        amount: z.number().int().min(1).optional(),
        date: dateSchema.optional(),
        method: z.enum(["cash", "transfer", "mercadopago"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      return db.transaction(async (tx) => {
        const previous = (
          await tx.select().from(schema.transactions).where(eq(schema.transactions.id, id)).limit(1)
        )[0];

        if (!previous) {
          throw new TRPCError({ code: "NOT_FOUND", message: "El movimiento no existe" });
        }

        await tx.update(schema.transactions).set(data).where(eq(schema.transactions.id, id));

        // Si cambió de fecha hay que recalcular los dos días.
        await refreshClosure(tx, previous.date);
        if (data.date && data.date !== previous.date) await refreshClosure(tx, data.date);

        return { success: true };
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const previous = (
          await tx
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.id, input.id))
            .limit(1)
        )[0];

        if (!previous) {
          throw new TRPCError({ code: "NOT_FOUND", message: "El movimiento no existe" });
        }

        await tx.delete(schema.transactions).where(eq(schema.transactions.id, input.id));
        await refreshClosure(tx, previous.date);
        return { success: true };
      });
    }),
});
