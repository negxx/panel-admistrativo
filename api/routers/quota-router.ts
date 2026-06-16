import { z } from "zod";
import { eq, and, sql, count } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

function calculateInterest(baseAmount: number, dueDate: string, dailyRatePercent: number, graceDays: number) {
  const today = new Date();
  const due = new Date(dueDate);
  const graceDue = new Date(due);
  graceDue.setDate(graceDue.getDate() + graceDays);

  if (today <= graceDue) return { overdueDays: 0, interest: 0 };

  const diffTime = today.getTime() - graceDue.getTime();
  const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const interest = Math.round(baseAmount * (dailyRatePercent / 100) * overdueDays);

  return { overdueDays, interest };
}

export const quotaRouter = createRouter({
  list: publicQuery.input(z.object({
    month: z.number().optional(),
    year: z.number().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    playerId: z.number().optional(),
    guardianId: z.number().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(25),
  })).query(async ({ input }) => {
    const db = getDb();
    const { month, year, category, status, playerId, guardianId, page, pageSize } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (month !== undefined) conditions.push(eq(schema.quotas.month, month));
    if (year !== undefined) conditions.push(eq(schema.quotas.year, year));
    if (status) conditions.push(eq(schema.quotas.status, status as "pending" | "paid" | "overdue"));
    if (playerId) conditions.push(eq(schema.quotas.playerId, playerId));

    // Build base query
    let query = db.select({
      id: schema.quotas.id,
      playerId: schema.quotas.playerId,
      playerName: schema.players.name,
      playerDni: schema.players.dni,
      category: schema.players.category,
      guardianId: schema.players.guardianId,
      guardianName: schema.guardians.name,
      month: schema.quotas.month,
      year: schema.quotas.year,
      baseAmount: schema.quotas.baseAmount,
      discountAmount: schema.quotas.discountAmount,
      interestAmount: schema.quotas.interestAmount,
      totalAmount: schema.quotas.totalAmount,
      dueDate: schema.quotas.dueDate,
      status: schema.quotas.status,
      paymentDate: schema.quotas.paymentDate,
      paymentMethod: schema.quotas.paymentMethod,
    }).from(schema.quotas)
      .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const quotasList = await query.where(whereClause).limit(pageSize).offset(offset)
      .orderBy(sql`${schema.quotas.dueDate} DESC`);

    // Filter by guardian after join
    let filtered = quotasList;
    if (guardianId) {
      filtered = quotasList.filter(q => q.guardianId === guardianId);
    }
    if (category) {
      filtered = filtered.filter(q => q.category === category);
    }

    // Recalculate interest for overdue quotas
    const settings = await db.select().from(schema.settings).where(eq(schema.settings.key, "interestRate")).limit(1);
    const interestRate = settings[0] ? parseFloat(settings[0].value) : 0.5;
    const graceDaysSettings = await db.select().from(schema.settings).where(eq(schema.settings.key, "graceDays")).limit(1);
    const graceDays = graceDaysSettings[0] ? parseInt(graceDaysSettings[0].value) : 3;

    const quotasWithCalculatedInterest = filtered.map(q => {
      const discount = q.discountAmount ?? 0;
      if (q.status === "overdue" || (q.status === "pending" && new Date(q.dueDate) < new Date())) {
        const { overdueDays, interest } = calculateInterest(q.baseAmount, q.dueDate, interestRate, graceDays);
        return { ...q, overdueDays, calculatedInterest: interest, displayTotal: q.baseAmount - discount + interest };
      }
      return { ...q, overdueDays: 0, calculatedInterest: 0, displayTotal: q.totalAmount };
    });

    return { quotas: quotasWithCalculatedInterest, total: filtered.length, page, pageSize };
  }),

  getById: publicQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const quota = await db.select().from(schema.quotas)
      .where(eq(schema.quotas.id, input.id))
      .limit(1);
    return quota[0] ?? null;
  }),

  generateMonthly: publicQuery.input(z.object({
    month: z.number().min(1).max(12),
    year: z.number(),
    dueDay: z.number().default(10),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { month, year, dueDay } = input;

    const activePlayers = await db.select().from(schema.players)
      .where(eq(schema.players.status, "active"));

    const configs = await db.select().from(schema.quotaConfigs);
    const configMap = new Map(configs.map(c => [c.category, c]));

    let created = 0;
    for (const player of activePlayers) {
      // Check if quota already exists
      const existing = await db.select().from(schema.quotas)
        .where(and(eq(schema.quotas.playerId, player.id), eq(schema.quotas.month, month), eq(schema.quotas.year, year)))
        .limit(1);

      if (existing[0]) continue;

      const config = configMap.get(player.category);
      const baseAmount = config?.baseAmount ?? 50000;

      // Check siblings for discount
      let discountAmount = 0;
      if (player.guardianId) {
        const siblings = await db.select({ count: count() }).from(schema.players)
          .where(and(eq(schema.players.guardianId, player.guardianId), eq(schema.players.status, "active")));
        const siblingCount = siblings[0]?.count ?? 0;
        const discountPercent = config?.siblingDiscountPercent ?? (siblingCount > 1 ? 10 : 0);
        discountAmount = Math.round(baseAmount * (discountPercent / 100));
      }

      const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

      await db.insert(schema.quotas).values({
        playerId: player.id,
        month,
        year,
        baseAmount,
        discountAmount,
        interestAmount: 0,
        totalAmount: baseAmount - discountAmount,
        dueDate,
        status: "pending",
      });
      created++;
    }

    return { created };
  }),

  recalculateInterest: publicQuery.mutation(async () => {
    const db = getDb();
    const settings = await db.select().from(schema.settings).where(eq(schema.settings.key, "interestRate")).limit(1);
    const interestRate = settings[0] ? parseFloat(settings[0].value) : 0.5;
    const graceDaysSettings = await db.select().from(schema.settings).where(eq(schema.settings.key, "graceDays")).limit(1);
    const graceDays = graceDaysSettings[0] ? parseInt(graceDaysSettings[0].value) : 3;

    const overdueQuotas = await db.select().from(schema.quotas)
      .where(eq(schema.quotas.status, "overdue"));

    let updated = 0;
    for (const quota of overdueQuotas) {
      const discount = quota.discountAmount ?? 0;
      const { interest } = calculateInterest(quota.baseAmount, quota.dueDate, interestRate, graceDays);
      if (interest !== quota.interestAmount) {
        await db.update(schema.quotas)
          .set({ interestAmount: interest, totalAmount: quota.baseAmount - discount + interest })
          .where(eq(schema.quotas.id, quota.id));
        updated++;
      }
    }

    return { updated };
  }),

  updateStatus: publicQuery.input(z.object({
    id: z.number(),
    status: z.enum(["pending", "paid", "overdue"]),
  })).mutation(async ({ input }) => {
    const db = getDb();
    await db.update(schema.quotas).set({ status: input.status }).where(eq(schema.quotas.id, input.id));
    return { success: true };
  }),

  getConfigs: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(schema.quotaConfigs).orderBy(schema.quotaConfigs.category);
  }),

  updateConfig: publicQuery.input(z.object({
    category: z.string(),
    baseAmount: z.number(),
    siblingDiscountPercent: z.number().min(0).max(100),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { category, ...data } = input;
    await db.insert(schema.quotaConfigs).values({ category, ...data })
      .onConflictDoUpdate({
        target: schema.quotaConfigs.category,
        set: data,
      });
    return { success: true };
  }),

  getGlobalSettings: publicQuery.query(async () => {
    const db = getDb();
    const allSettings = await db.select().from(schema.settings);
    const map: Record<string, string> = {};
    for (const s of allSettings) map[s.key] = s.value;
    return {
      interestRate: parseFloat(map.interestRate ?? "0.5"),
      graceDays: parseInt(map.graceDays ?? "3"),
      dueDay: parseInt(map.dueDay ?? "10"),
      discountEnabled: map.discountEnabled === "true",
      discountPercent: parseFloat(map.discountPercent ?? "0"),
    };
  }),

  updateGlobalSettings: publicQuery.input(z.object({
    interestRate: z.number(),
    graceDays: z.number(),
    dueDay: z.number(),
    discountEnabled: z.boolean(),
    discountPercent: z.number(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const entries = [
      { key: "interestRate", value: String(input.interestRate) },
      { key: "graceDays", value: String(input.graceDays) },
      { key: "dueDay", value: String(input.dueDay) },
      { key: "discountEnabled", value: String(input.discountEnabled) },
      { key: "discountPercent", value: String(input.discountPercent) },
    ];
    for (const entry of entries) {
      await db.insert(schema.settings).values(entry)
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: entry.value } });
    }
    return { success: true };
  }),
});
