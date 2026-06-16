import { z } from "zod";
import { eq, like, and, sql, count } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const playerRouter = createRouter({
  list: publicQuery.input(z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(25),
  })).query(async ({ input }) => {
    const db = getDb();
    const { search, category, status, page, pageSize } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search) {
      conditions.push(like(schema.players.name, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(schema.players.category, category));
    }
    if (status) {
      conditions.push(eq(schema.players.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await db.select({ count: count() }).from(schema.players).where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const players = await db.select({
      id: schema.players.id,
      name: schema.players.name,
      dni: schema.players.dni,
      birthDate: schema.players.birthDate,
      category: schema.players.category,
      quotaType: schema.players.quotaType,
      phone: schema.players.phone,
      status: schema.players.status,
      guardianId: schema.players.guardianId,
      guardianName: schema.guardians.name,
    }).from(schema.players)
      .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(schema.players.name);

    // Get quota status for each player
    const playersWithStatus = await Promise.all(players.map(async (p) => {
      const latestQuota = await db.select().from(schema.quotas)
        .where(eq(schema.quotas.playerId, p.id))
        .orderBy(sql`${schema.quotas.year} DESC, ${schema.quotas.month} DESC`)
        .limit(1);
      return {
        ...p,
        latestQuotaStatus: latestQuota[0]?.status ?? null,
        latestQuotaAmount: latestQuota[0]?.totalAmount ?? null,
      };
    }));

    return { players: playersWithStatus, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }),

  getById: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const player = await db.select().from(schema.players)
      .where(eq(schema.players.id, input.id))
      .limit(1);
    if (!player[0]) return null;

    const guardian = player[0].guardianId
      ? await db.select().from(schema.guardians).where(eq(schema.guardians.id, player[0].guardianId)).limit(1)
      : [];

    const quotasList = await db.select().from(schema.quotas)
      .where(eq(schema.quotas.playerId, input.id))
      .orderBy(sql`${schema.quotas.year} DESC, ${schema.quotas.month} DESC`);

    return { ...player[0], guardian: guardian[0] ?? null, quotas: quotasList };
  }),

  create: publicQuery.input(z.object({
    name: z.string().min(1),
    dni: z.string().min(1),
    birthDate: z.string(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    category: z.string().min(1),
    quotaType: z.enum(["deportivo", "hermanos", "individual"]).optional(),
    guardianId: z.number().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(schema.players).values({
      ...input,
      status: "active",
      registrationDate: new Date().toISOString().split("T")[0],
    }).returning();

    // Auto-create quota for current month
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDay = 10;
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

    // ✅ CORREGIDO: Buscar en categories en vez de quotaConfigs
    const categoryConfig = await db.select().from(schema.categories)
      .where(eq(schema.categories.name, input.category))
      .limit(1);

    const baseAmount = categoryConfig[0]?.baseAmount ?? 50000;

    await db.insert(schema.quotas).values({
      playerId: result[0].id,
      month,
      year,
      baseAmount,
      discountAmount: 0,
      interestAmount: 0,
      totalAmount: baseAmount,
      dueDate,
      status: "pending",
    });

    return result[0];
  }),

  update: publicQuery.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    dni: z.string().optional(),
    birthDate: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    category: z.string().optional(),
    quotaType: z.enum(["deportivo", "hermanos", "individual"]).optional(),
    guardianId: z.number().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(schema.players).set(data).where(eq(schema.players.id, id));
    return { success: true };
  }),

  delete: publicQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(schema.players).set({ status: "inactive" }).where(eq(schema.players.id, input.id));
    return { success: true };
  }),
});