import { z } from "zod";
import { eq, like, count, and } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const guardianRouter = createRouter({
  list: publicQuery.input(z.object({
    search: z.string().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(25,
    ),
  })).query(async ({ input }) => {
    const db = getDb();
    const { search, page, pageSize } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search) {
      conditions.push(like(schema.guardians.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await db.select({ count: count() }).from(schema.guardians).where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const guardiansList = await db.select().from(schema.guardians)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(schema.guardians.name);

    // Get player count for each guardian
    const guardiansWithCount = await Promise.all(guardiansList.map(async (g) => {
      const players = await db.select({ count: count() }).from(schema.players)
        .where(eq(schema.players.guardianId, g.id));
      return { ...g, playerCount: players[0]?.count ?? 0 };
    }));

    return { guardians: guardiansWithCount, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }),

  getById: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const guardian = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.id, input.id))
      .limit(1);
    if (!guardian[0]) return null;

    const children = await db.select().from(schema.players)
      .where(eq(schema.players.guardianId, input.id))
      .orderBy(schema.players.name);

    // Get latest quotas for each child
    const childrenWithQuotas = await Promise.all(children.map(async (child) => {
      const quotas = await db.select().from(schema.quotas)
        .where(eq(schema.quotas.playerId, child.id))
        .orderBy(schema.quotas.year, schema.quotas.month);
      return { ...child, quotas };
    }));

    // Get payment history
    const payments = await db.select().from(schema.payments)
      .where(eq(schema.payments.guardianId, input.id))
      .orderBy(schema.payments.paymentDate);

    return { ...guardian[0], children: childrenWithQuotas, payments };
  }),

  create: publicQuery.input(z.object({
    name: z.string().min(1),
    dni: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().optional(),
    address: z.string().optional(),
    pin: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(schema.guardians).values(input).returning();
    return result[0];
  }),

  update: publicQuery.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    dni: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    pin: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(schema.guardians).set(data).where(eq(schema.guardians.id, id));
    return { success: true };
  }),

  delete: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(schema.guardians).where(eq(schema.guardians.id, input.id));
    return { success: true };
  }),

  getByDni: publicQuery.input(z.object({ dni: z.string() })).query(async ({ input }) => {
    const db = getDb();
    const result = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.dni, input.dni))
      .limit(1);
    return result[0] ?? null;
  }),

  verifyPin: publicQuery.input(z.object({
    dni: z.string(),
    pin: z.string(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const guardian = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.dni, input.dni))
      .limit(1);

    if (!guardian[0]) return { success: false, message: "Guardian not found" };
    if (!guardian[0].pin) return { success: false, message: "PIN not set" };
    if (guardian[0].pin !== input.pin) return { success: false, message: "Invalid PIN" };

    return { success: true, guardianId: guardian[0].id };
  }),

  setPin: publicQuery.input(z.object({
    dni: z.string(),
    pin: z.string().length(4),
  })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(schema.guardians)
      .set({ pin: input.pin })
      .where(eq(schema.guardians.dni, input.dni));
    return { success: true };
  }),
});
