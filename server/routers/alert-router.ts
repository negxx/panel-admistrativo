import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { MONTH_NAMES } from "../../contracts/constants";
import { syncOverdueQuotas } from "../domain/quotas";
import { getSettings } from "../domain/settings";

/**
 * Deudores y avisos por WhatsApp.
 *
 * Antes esta pantalla aparecía siempre vacía, porque filtraba por cuotas en
 * estado `overdue` y **nada en el sistema las marcaba como vencidas**. Ahora
 * `syncOverdueQuotas` corre antes de cada consulta.
 *
 * El envío es asistido, no automático: el sistema arma el mensaje y el link de
 * WhatsApp, y la persona lo manda desde su teléfono. Por eso los avisos se
 * registran como `prepared` y pasan a `sent` recién cuando el operador confirma
 * que lo envió. La versión anterior los daba por enviados sin que saliera nada.
 */

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

export function buildWhatsAppMessage(params: {
  clubName: string;
  name: string;
  quotas: Array<{ month: number; year: number; totalAmount: number }>;
  totalDebt: number;
}): string {
  const detail = params.quotas
    .map((q) => `• ${MONTH_NAMES[q.month - 1]} ${q.year}: ${formatMoney(q.totalAmount)}`)
    .join("\n");

  return [
    `Hola ${params.name}! Te escribimos del *${params.clubName}*.`,
    "",
    "Te recordamos que tenés cuotas pendientes:",
    detail,
    "",
    `Total: *${formatMoney(params.totalDebt)}* (incluye intereses por mora).`,
    "",
    "Podés pagar en secretaría o desde el portal de socios.",
    "¡Gracias!",
  ].join("\n");
}

export const alertRouter = createRouter({
  /**
   * Deudores agrupados por cuenta (tutor o socio sin tutor).
   *
   * La versión anterior descartaba a los socios sin tutor con un
   * `if (!q.guardianId) continue`: los mayores que se manejan solos nunca
   * aparecían en la lista de morosos.
   */
  getDebtors: staffProcedure
    .input(
      z
        .object({
          /** Deuda mínima para aparecer en la lista. */
          minAmount: z.number().int().min(0).default(0),
          /** Sólo cuentas con cuotas vencidas (excluye las que sólo tienen pendientes). */
          onlyOverdue: z.boolean().default(true),
        })
        .default({ minAmount: 0, onlyOverdue: true }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const statuses: Array<"pending" | "overdue"> = input.onlyOverdue
        ? ["overdue"]
        : ["overdue", "pending"];

      const rows = await db
        .select({
          quotaId: schema.quotas.id,
          guardianId: schema.players.guardianId,
          guardianName: schema.guardians.name,
          guardianPhone: schema.guardians.phone,
          whatsappEnabled: schema.guardians.whatsappEnabled,
          playerId: schema.players.id,
          playerName: schema.players.name,
          playerPhone: schema.players.phone,
          month: schema.quotas.month,
          year: schema.quotas.year,
          totalAmount: schema.quotas.totalAmount,
          dueDate: schema.quotas.dueDate,
          status: schema.quotas.status,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
        .where(
          and(inArray(schema.quotas.status, statuses), eq(schema.players.status, "active")),
        )
        .orderBy(schema.quotas.year, schema.quotas.month);

      type Debtor = {
        key: string;
        kind: "guardian" | "player";
        id: number;
        name: string;
        phone: string | null;
        whatsappEnabled: boolean;
        quotas: Array<{
          quotaId: number;
          playerName: string;
          month: number;
          year: number;
          totalAmount: number;
          dueDate: string;
          status: string;
        }>;
        totalDebt: number;
        overdueCount: number;
      };

      const byAccount = new Map<string, Debtor>();

      for (const row of rows) {
        const isGuardian = row.guardianId != null;
        const id = isGuardian ? row.guardianId! : row.playerId;
        const key = `${isGuardian ? "g" : "p"}${id}`;

        let debtor = byAccount.get(key);
        if (!debtor) {
          debtor = {
            key,
            kind: isGuardian ? "guardian" : "player",
            id,
            name: (isGuardian ? row.guardianName : row.playerName) ?? "Sin nombre",
            phone: (isGuardian ? row.guardianPhone : row.playerPhone) ?? null,
            whatsappEnabled: isGuardian ? (row.whatsappEnabled ?? true) : true,
            quotas: [],
            totalDebt: 0,
            overdueCount: 0,
          };
          byAccount.set(key, debtor);
        }

        debtor.quotas.push({
          quotaId: row.quotaId,
          playerName: row.playerName,
          month: row.month,
          year: row.year,
          totalAmount: row.totalAmount,
          dueDate: row.dueDate,
          status: row.status,
        });
        debtor.totalDebt += row.totalAmount;
        if (row.status === "overdue") debtor.overdueCount += 1;
      }

      const guardianIds = [...byAccount.values()]
        .filter((d) => d.kind === "guardian")
        .map((d) => d.id);

      const lastAlerts = guardianIds.length
        ? await db
            .select({
              guardianId: schema.alertLogs.guardianId,
              sentAt: sql<Date | null>`MAX(${schema.alertLogs.sentAt})`,
            })
            .from(schema.alertLogs)
            .where(inArray(schema.alertLogs.guardianId, guardianIds))
            .groupBy(schema.alertLogs.guardianId)
        : [];

      const lastAlertByGuardian = new Map(
        lastAlerts.map((a) => [a.guardianId, a.sentAt ? new Date(a.sentAt) : null]),
      );

      const debtors = [...byAccount.values()]
        .filter((d) => d.totalDebt >= input.minAmount)
        .map((d) => ({
          ...d,
          quotaCount: d.quotas.length,
          lastAlertDate: d.kind === "guardian" ? (lastAlertByGuardian.get(d.id) ?? null) : null,
        }))
        .sort((a, b) => b.totalDebt - a.totalDebt);

      return {
        debtors,
        totalDebt: debtors.reduce((sum, d) => sum + d.totalDebt, 0),
        totalQuotas: debtors.reduce((sum, d) => sum + d.quotaCount, 0),
      };
    }),

  /**
   * Arma el mensaje y el link de WhatsApp para una cuenta.
   * No manda nada: devuelve el link para que lo abra el operador.
   */
  buildMessage: staffProcedure
    .input(
      z.object({
        kind: z.enum(["guardian", "player"]),
        id: z.number().int().positive(),
        customMessage: z.string().trim().max(1000).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);
      const settings = await getSettings(db);

      const account =
        input.kind === "guardian"
          ? (
              await db
                .select({ name: schema.guardians.name, phone: schema.guardians.phone })
                .from(schema.guardians)
                .where(eq(schema.guardians.id, input.id))
                .limit(1)
            )[0]
          : (
              await db
                .select({ name: schema.players.name, phone: schema.players.phone })
                .from(schema.players)
                .where(eq(schema.players.id, input.id))
                .limit(1)
            )[0];

      if (!account) return null;

      const quotas = await db
        .select({
          id: schema.quotas.id,
          month: schema.quotas.month,
          year: schema.quotas.year,
          totalAmount: schema.quotas.totalAmount,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(
          and(
            input.kind === "guardian"
              ? eq(schema.players.guardianId, input.id)
              : eq(schema.players.id, input.id),
            inArray(schema.quotas.status, ["pending", "overdue"]),
          ),
        )
        .orderBy(schema.quotas.year, schema.quotas.month);

      const totalDebt = quotas.reduce((sum, q) => sum + q.totalAmount, 0);
      const message =
        input.customMessage ??
        buildWhatsAppMessage({
          clubName: settings.clubName,
          name: account.name,
          quotas,
          totalDebt,
        });

      // WhatsApp espera el número sin espacios ni símbolos.
      const phone = (account.phone ?? "").replace(/\D/g, "");

      return {
        name: account.name,
        phone: phone || null,
        message,
        quotaIds: quotas.map((q) => q.id),
        totalDebt,
        whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
      };
    }),

  /**
   * Deja registrado que se preparó (o se envió) un aviso.
   *
   * `status` distingue las dos cosas: la versión anterior guardaba siempre
   * "sent" sin que se enviara nada, así que el historial mentía.
   */
  logAlert: staffProcedure
    .input(
      z.object({
        kind: z.enum(["guardian", "player"]),
        id: z.number().int().positive(),
        quotaIds: z.array(z.number().int().positive()).default([]),
        message: z.string().trim().max(1000),
        status: z.enum(["prepared", "sent"]).default("prepared"),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .insert(schema.alertLogs)
        .values({
          guardianId: input.kind === "guardian" ? input.id : null,
          playerId: input.kind === "player" ? input.id : null,
          quotaIds: JSON.stringify(input.quotaIds),
          message: input.message,
          status: input.status,
        });
      return { success: true };
    }),

  getLogs: staffProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).default({ limit: 100 }))
    .query(async ({ input }) => {
      const db = getDb();
      const logs = await db
        .select({
          id: schema.alertLogs.id,
          guardianName: schema.guardians.name,
          playerName: schema.players.name,
          message: schema.alertLogs.message,
          status: schema.alertLogs.status,
          sentAt: schema.alertLogs.sentAt,
        })
        .from(schema.alertLogs)
        .leftJoin(schema.guardians, eq(schema.alertLogs.guardianId, schema.guardians.id))
        .leftJoin(schema.players, eq(schema.alertLogs.playerId, schema.players.id))
        .orderBy(desc(schema.alertLogs.sentAt))
        .limit(input.limit);

      return logs.map((log) => ({
        ...log,
        name: log.guardianName ?? log.playerName ?? "Sin nombre",
      }));
    }),
});
