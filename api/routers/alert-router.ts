import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

function buildWhatsAppMessage(guardianName: string, quotas: Array<{ month: number; year: number; totalAmount: number }>, totalDebt: number) {
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const quotaList = quotas.map(q => `${monthNames[q.month - 1]}/${q.year}: $${q.totalAmount.toLocaleString("es-AR")}`).join("\n");
  return `Hola ${guardianName}! Te escribimos desde *Club Atletico*. 
Te recordamos que tenes cuota(s) vencida(s):
${quotaList}
Total adeudado: *$${totalDebt.toLocaleString("es-AR")}* (incluye intereses por atraso).
Por favor, regulariza tu situacion. Podes pagar en secretaria o por transferencia.
Gracias!`;
}

export const alertRouter = createRouter({
  getDebtors: publicQuery.query(async () => {
    const db = getDb();

    const overdueQuotas = await db.select({
      id: schema.quotas.id,
      guardianId: schema.players.guardianId,
      guardianName: schema.guardians.name,
      guardianPhone: schema.guardians.phone,
      playerName: schema.players.name,
      month: schema.quotas.month,
      year: schema.quotas.year,
      baseAmount: schema.quotas.baseAmount,
      interestAmount: schema.quotas.interestAmount,
      totalAmount: schema.quotas.totalAmount,
      dueDate: schema.quotas.dueDate,
    }).from(schema.quotas)
      .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
      .where(eq(schema.quotas.status, "overdue"));

    // Group by guardian
    const guardianMap = new Map<number, {
      guardianId: number;
      guardianName: string;
      guardianPhone: string;
      quotas: typeof overdueQuotas;
      totalDebt: number;
    }>();

    for (const q of overdueQuotas) {
      if (!q.guardianId) continue;
      const existing = guardianMap.get(q.guardianId);
      if (existing) {
        existing.quotas.push(q);
        existing.totalDebt += q.totalAmount;
      } else {
        guardianMap.set(q.guardianId, {
          guardianId: q.guardianId,
          guardianName: q.guardianName ?? "",
          guardianPhone: q.guardianPhone ?? "",
          quotas: [q],
          totalDebt: q.totalAmount,
        });
      }
    }

    // Get last alert date for each guardian
    const debtors = await Promise.all(Array.from(guardianMap.values()).map(async (g) => {
      const lastAlert = await db.select().from(schema.alertLogs)
        .where(eq(schema.alertLogs.guardianId, g.guardianId))
        .orderBy(sql`${schema.alertLogs.sentAt} DESC`)
        .limit(1);
      return {
        ...g,
        lastAlertDate: lastAlert[0]?.sentAt ?? null,
        quotaCount: g.quotas.length,
      };
    }));

    return debtors;
  }),

  getWhatsAppLink: publicQuery.input(z.object({
    guardianId: z.number(),
    message: z.string().optional(),
  })).query(async ({ input }) => {
    const db = getDb();
    const guardian = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.id, input.guardianId))
      .limit(1);

    if (!guardian[0] || !guardian[0].phone) return null;

    let message = input.message;
    if (!message) {
      // Build default message
      const quotas = await db.select({
        month: schema.quotas.month,
        year: schema.quotas.year,
        totalAmount: schema.quotas.totalAmount,
      }).from(schema.quotas)
        .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(and(eq(schema.players.guardianId, input.guardianId), eq(schema.quotas.status, "overdue")));

      const totalDebt = quotas.reduce((s, q) => s + q.totalAmount, 0);
      message = buildWhatsAppMessage(guardian[0].name, quotas, totalDebt);
    }

    const phone = guardian[0].phone.replace(/\D/g, "");
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${phone}?text=${encoded}`;
  }),

  sendWhatsApp: publicQuery.input(z.object({
    guardianId: z.number(),
    quotaIds: z.array(z.number()),
    message: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { guardianId, quotaIds } = input;

    // Log the alert
    await db.insert(schema.alertLogs).values({
      guardianId,
      quotaIds: JSON.stringify(quotaIds),
      message: input.message ?? "Alerta de cuota vencida",
      status: "sent",
    });

    return { success: true };
  }),

  sendBulk: publicQuery.input(z.object({
    guardianIds: z.array(z.number()),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const results: Array<{ guardianId: number; success: boolean }> = [];

    for (const guardianId of input.guardianIds) {
      try {
        const quotas = await db.select({ id: schema.quotas.id }).from(schema.quotas)
          .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
          .where(and(eq(schema.players.guardianId, guardianId), eq(schema.quotas.status, "overdue")));

        await db.insert(schema.alertLogs).values({
          guardianId,
          quotaIds: JSON.stringify(quotas.map(q => q.id)),
          message: "Alerta masiva de cuotas vencidas",
          status: "sent",
        });

        results.push({ guardianId, success: true });
      } catch {
        results.push({ guardianId, success: false });
      }
    }

    return { results, sent: results.filter(r => r.success).length };
  }),

  getLogs: publicQuery.input(z.object({
    guardianId: z.number().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = getDb();
    const conditions = [];
    if (input.guardianId) conditions.push(eq(schema.alertLogs.guardianId, input.guardianId));
    if (input.dateFrom) conditions.push(sql`${schema.alertLogs.sentAt} >= ${input.dateFrom}`);
    if (input.dateTo) conditions.push(sql`${schema.alertLogs.sentAt} <= ${input.dateTo}`);

    const whereClause = conditions.length > 0 ? conditions.length === 1 ? conditions[0] : and(...conditions) : undefined;

    const logs = await db.select({
      id: schema.alertLogs.id,
      guardianName: schema.guardians.name,
      message: schema.alertLogs.message,
      status: schema.alertLogs.status,
      sentAt: schema.alertLogs.sentAt,
    }).from(schema.alertLogs)
      .leftJoin(schema.guardians, eq(schema.alertLogs.guardianId, schema.guardians.id))
      .where(whereClause)
      .orderBy(sql`${schema.alertLogs.sentAt} DESC`)
      .limit(100);

    return logs;
  }),
});
