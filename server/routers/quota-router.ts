import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, adminProcedure, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { currentYear, isValidDate, today } from "../lib/dates";
import { generateMonthlyQuotas, syncOverdueQuotas } from "../domain/quotas";
import { getSettings, saveSettings } from "../domain/settings";

export const quotaRouter = createRouter({
  /**
   * Listado de cuotas con filtros y paginación.
   *
   * Antes los filtros por categoría y por tutor se aplicaban en JavaScript
   * **después** del `LIMIT/OFFSET`, así que sólo filtraban la página que se
   * estaba viendo, y el `total` devolvía el largo de esa página en vez del total
   * real. Ahora todo se resuelve en SQL y el conteo usa el mismo `WHERE`.
   */
  list: staffProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
        category: z.string().optional(),
        status: z.enum(["pending", "paid", "overdue"]).optional(),
        playerId: z.number().int().positive().optional(),
        guardianId: z.number().int().positive().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      // Pone al día vencimientos e intereses antes de mostrar nada.
      await syncOverdueQuotas(db);

      const { month, year, category, status, playerId, guardianId, page, pageSize } = input;

      const conditions = [];
      if (month !== undefined) conditions.push(eq(schema.quotas.month, month));
      if (year !== undefined) conditions.push(eq(schema.quotas.year, year));
      if (status) conditions.push(eq(schema.quotas.status, status));
      if (playerId) conditions.push(eq(schema.quotas.playerId, playerId));
      if (category) conditions.push(eq(schema.players.category, category));
      if (guardianId) conditions.push(eq(schema.players.guardianId, guardianId));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = Number(
        (
          await db
            .select({ count: count() })
            .from(schema.quotas)
            .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
            .where(where)
        )[0]?.count ?? 0,
      );

      const quotas = await db
        .select({
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
          receiptNumber: schema.quotas.receiptNumber,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
        .where(where)
        .orderBy(schema.players.name, desc(schema.quotas.dueDate))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      // Cuotas ya informadas desde el portal y esperando confirmación. Se marcan
      // para que la secretaría no las cobre dos veces.
      const ids = quotas.map((q) => q.id);
      const awaiting = ids.length
        ? new Set(
            (
              await db
                .select({ quotaId: schema.paymentQuotas.quotaId })
                .from(schema.paymentQuotas)
                .innerJoin(schema.payments, eq(schema.paymentQuotas.paymentId, schema.payments.id))
                .where(
                  and(
                    inArray(schema.paymentQuotas.quotaId, ids),
                    eq(schema.payments.status, "pending_review"),
                  ),
                )
            ).map((r) => r.quotaId),
          )
        : new Set<number>();

      return {
        quotas: quotas.map((q) => ({ ...q, awaitingReview: awaiting.has(q.id) })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),

  /** Totales del período filtrado. Se calculan sobre todas las cuotas, no sobre la página. */
  summary: staffProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
        category: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const conditions = [];
      if (input.month !== undefined) conditions.push(eq(schema.quotas.month, input.month));
      if (input.year !== undefined) conditions.push(eq(schema.quotas.year, input.year));
      if (input.category) conditions.push(eq(schema.players.category, input.category));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          status: schema.quotas.status,
          total: sql<number>`COALESCE(SUM(${schema.quotas.totalAmount}), 0)::integer`,
          base: sql<number>`COALESCE(SUM(${schema.quotas.baseAmount} - ${schema.quotas.discountAmount}), 0)::integer`,
          count: count(),
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(where)
        .groupBy(schema.quotas.status);

      let expected = 0;
      let collected = 0;
      let pending = 0;
      let overdueCount = 0;

      for (const row of rows) {
        expected += Number(row.base);
        if (row.status === "paid") collected += Number(row.total);
        else pending += Number(row.total);
        if (row.status === "overdue") overdueCount += Number(row.count);
      }

      return { expected, collected, pending, overdueCount };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      return (
        (await db.select().from(schema.quotas).where(eq(schema.quotas.id, input.id)).limit(1))[0] ??
        null
      );
    }),

  /**
   * Genera las cuotas de un mes. Ver `api/domain/quotas.ts` para las reglas.
   * Corre en una transacción: o se generan todas o ninguna.
   */
  generateMonthly: staffProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
        dueDay: z.number().int().min(1).max(28).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction((tx) => generateMonthlyQuotas(tx, input));
    }),

  /** Fuerza el recálculo de vencidas e intereses. Normalmente ya corre solo. */
  recalculateInterest: staffProcedure.mutation(async () => {
    const result = await syncOverdueQuotas(getDb());
    return { updated: result.interestUpdated, markedOverdue: result.markedOverdue };
  }),

  /**
   * Cambia el estado de una cuota a mano.
   *
   * No permite marcar "pagada" desde acá: para que una cuota figure pagada tiene
   * que existir un pago que la respalde (ver `payment.register`), si no la caja
   * y las cuotas dejan de cuadrar.
   */
  updateStatus: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["pending", "overdue"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const quota = (
        await db.select().from(schema.quotas).where(eq(schema.quotas.id, input.id)).limit(1)
      )[0];

      if (!quota) throw new TRPCError({ code: "NOT_FOUND", message: "La cuota no existe" });
      if (quota.status === "paid") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "La cuota está pagada. Anulá el pago si necesitás revertirla.",
        });
      }

      await db.update(schema.quotas).set({ status: input.status }).where(eq(schema.quotas.id, input.id));
      return { success: true };
    }),

  /** Anota una observación en la cuota (ej: "convenio de pago en 3 veces"). */
  updateNotes: staffProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().max(500) }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(schema.quotas)
        .set({ notes: input.notes })
        .where(eq(schema.quotas.id, input.id));
      return { success: true };
    }),

  /** Genera una cuota suelta para un socio, fuera de la generación mensual. */
  createForPlayer: staffProcedure
    .input(
      z.object({
        playerId: z.number().int().positive(),
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
        baseAmount: z.number().int().min(0),
        discountAmount: z.number().int().min(0).default(0),
        dueDate: z.string().refine(isValidDate, "Fecha inválida"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const exists = (
        await db
          .select({ id: schema.quotas.id })
          .from(schema.quotas)
          .where(
            and(
              eq(schema.quotas.playerId, input.playerId),
              eq(schema.quotas.month, input.month),
              eq(schema.quotas.year, input.year),
            ),
          )
          .limit(1)
      )[0];

      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ese socio ya tiene una cuota para ese mes",
        });
      }

      return (
        await db
          .insert(schema.quotas)
          .values({
            playerId: input.playerId,
            month: input.month,
            year: input.year,
            baseAmount: input.baseAmount,
            discountAmount: input.discountAmount,
            interestAmount: 0,
            totalAmount: Math.max(0, input.baseAmount - input.discountAmount),
            dueDate: input.dueDate,
            status: "pending",
          })
          .returning()
      )[0];
    }),

  // ─── Configuración global ──────────────────────────────────────────────────

  getGlobalSettings: staffProcedure.query(() => getSettings(getDb())),

  /** Sólo admin: cambia intereses, vencimientos y datos bancarios del portal. */
  updateGlobalSettings: adminProcedure
    .input(
      z.object({
        interestRate: z.number().min(0).max(100),
        graceDays: z.number().int().min(0).max(60),
        dueDay: z.number().int().min(1).max(28),
        discountEnabled: z.boolean(),
        discountPercent: z.number().min(0).max(100),
        clubName: z.string().trim().min(1).max(80),
        bankName: z.string().trim().max(80),
        bankCbu: z.string().trim().max(40),
        bankAlias: z.string().trim().max(40),
        bankHolder: z.string().trim().max(80),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.transaction(async (tx) => {
        await saveSettings(tx, input);
        // Un cambio de tasa o de días de gracia se refleja al instante.
        await syncOverdueQuotas(tx);
      });
      return { success: true };
    }),

  /** Años con cuotas cargadas. Alimenta el filtro de la pantalla. */
  availableYears: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ year: schema.quotas.year })
      .from(schema.quotas)
      .orderBy(desc(schema.quotas.year));
    const years = rows.map((r) => r.year);
    const thisYear = currentYear();
    if (!years.includes(thisYear)) years.unshift(thisYear);
    return years;
  }),

  /** Fecha de hoy según la zona horaria del club. El navegador puede estar en otra. */
  clubToday: staffProcedure.query(() => today()),
});
