import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createRouter, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const closureRouter = createRouter({
  list: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(schema.dailyClosures)
      .orderBy(schema.dailyClosures.date);
  }),

  getByDate: adminQuery.input(
    z.object({ date: z.string() })
  ).query(async ({ input }) => {
    const db = getDb();
    const closure = await db.select().from(schema.dailyClosures)
      .where(eq(schema.dailyClosures.date, input.date))
      .limit(1);
    return closure[0] || null;
  }),

  open: adminQuery.input(
    z.object({
      date: z.string(),
      openingAmount: z.number().default(0),
      openedBy: z.number(),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    const existing = await db.select().from(schema.dailyClosures)
      .where(eq(schema.dailyClosures.date, input.date))
      .limit(1);
    
    if (existing[0]) {
      throw new Error("Ya existe un cierre para esta fecha");
    }

    const result = await db.insert(schema.dailyClosures).values({
      date: input.date,
      openedBy: input.openedBy,
      openingAmount: input.openingAmount,
      status: "open",
    }).returning();

    return result[0];
  }),

  close: adminQuery.input(
    z.object({
      id: z.number(),
      closedBy: z.number(),
      cashSales: z.number().optional(),
      transferSales: z.number().optional(),
      mpSales: z.number().optional(),
      totalIncome: z.number().optional(),
      totalExpenses: z.number().optional(),
      actualCash: z.number().default(0),
      notes: z.string().optional(),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;

    const closure = await db.select().from(schema.dailyClosures)
      .where(eq(schema.dailyClosures.id, id))
      .limit(1);

    if (!closure[0]) {
      throw new Error("Cierre no encontrado");
    }

    const expectedCash = (closure[0].openingAmount || 0) + (closure[0].cashSales || 0);
    const difference = (data.actualCash || 0) - expectedCash;

    // Solo actualizar los campos que vienen en data, sin sobrescribir los demás
    const updateData: any = {
      actualCash: data.actualCash,
      notes: data.notes,
      expectedCash,
      difference,
      status: "closed",
      closedAt: new Date(),
    };

    // Solo actualizar ventas si se envían explícitamente
    if (data.cashSales !== undefined) updateData.cashSales = data.cashSales;
    if (data.transferSales !== undefined) updateData.transferSales = data.transferSales;
    if (data.mpSales !== undefined) updateData.mpSales = data.mpSales;
    if (data.totalIncome !== undefined) updateData.totalIncome = data.totalIncome;
    if (data.totalExpenses !== undefined) updateData.totalExpenses = data.totalExpenses;

    await db.update(schema.dailyClosures)
      .set(updateData)
      .where(eq(schema.dailyClosures.id, id));

    return { success: true };
  }),

  delete: adminQuery.input(
    z.object({ id: z.number() })
  ).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(schema.dailyClosures)
      .where(eq(schema.dailyClosures.id, input.id));
    return { success: true };
  }),
});