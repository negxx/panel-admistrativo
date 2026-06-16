import { z } from "zod";
import { eq, and, sql, count, sum } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const transactionRouter = createRouter({
  list: publicQuery.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(25),
  })).query(async ({ input }) => {
    const db = getDb();
    const { dateFrom, dateTo, type, category, page, pageSize } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (dateFrom) conditions.push(sql`${schema.transactions.date} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${schema.transactions.date} <= ${dateTo}`);
    if (type) conditions.push(eq(schema.transactions.type, type as "income" | "expense"));
    if (category) conditions.push(eq(schema.transactions.category, category));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await db.select({ count: count() }).from(schema.transactions).where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const transactions = await db.select().from(schema.transactions)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${schema.transactions.date} DESC`);

    return { transactions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }),

  getSummary: publicQuery.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = getDb();
    const conditions = [];
    if (input.dateFrom) conditions.push(sql`${schema.transactions.date} >= ${input.dateFrom}`);
    if (input.dateTo) conditions.push(sql`${schema.transactions.date} <= ${input.dateTo}`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const income = await db.select({ total: sum(schema.transactions.amount) })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.type, "income"), whereClause));

    const expense = await db.select({ total: sum(schema.transactions.amount) })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.type, "expense"), whereClause));

    return {
      totalIncome: Number(income[0]?.total ?? 0),
      totalExpense: Number(expense[0]?.total ?? 0),
      balance: Number(income[0]?.total ?? 0) - Number(expense[0]?.total ?? 0),
    };
  }),

  getMonthlyTrend: publicQuery.query(async () => {
    const db = getDb();
    const result = await db.all<{ month: string; income: number; expense: number }>(`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions
      WHERE date >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month
    `);
    return result;
  }),

  create: publicQuery.input(z.object({
    type: z.enum(["income", "expense"]),
    category: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().min(1),
    date: z.string(),
    attachmentUrl: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(schema.transactions).values({
      ...input,
      createdBy: null,
    }).returning();
    return result[0];
  }),

  update: publicQuery.input(z.object({
    id: z.number(),
    type: z.enum(["income", "expense"]).optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    amount: z.number().optional(),
    date: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(schema.transactions).set(data).where(eq(schema.transactions.id, id));
    return { success: true };
  }),

  delete: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(schema.transactions).where(eq(schema.transactions.id, input.id));
    return { success: true };
  }),
});
