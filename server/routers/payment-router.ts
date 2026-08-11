import { z } from "zod";
import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { isValidDate } from "../lib/dates";
import {
  confirmPayment,
  playerIdsForPayer,
  registerPayment,
  rejectPayment,
  type Payer,
} from "../domain/payments";
import { syncOverdueQuotas } from "../domain/quotas";

/**
 * Pagos vistos desde el panel.
 *
 * La lógica pesada (validaciones, transacciones, recibos, caja) vive en
 * `api/domain/payments.ts`; acá sólo se valida la entrada y se arma la respuesta.
 */

const payerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guardian"), id: z.number().int().positive() }),
  z.object({ kind: z.literal("player"), id: z.number().int().positive() }),
]);

const dateSchema = z.string().refine(isValidDate, "Fecha inválida (usá AAAA-MM-DD)");

/** El id del usuario del panel, sólo si es una cuenta local. */
function staffId(user: { source: string; id: number }): number | null {
  return user.source === "local" ? user.id : null;
}

export const paymentRouter = createRouter({
  list: staffProcedure
    .input(
      z.object({
        dateFrom: dateSchema.optional(),
        dateTo: dateSchema.optional(),
        guardianId: z.number().int().positive().optional(),
        method: z.enum(["cash", "transfer", "mercadopago"]).optional(),
        status: z.enum(["confirmed", "pending_review", "rejected"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const { dateFrom, dateTo, guardianId, method, status, page, pageSize } = input;

      const conditions = [];
      if (dateFrom) conditions.push(sql`${schema.payments.paymentDate} >= ${dateFrom}`);
      if (dateTo) conditions.push(sql`${schema.payments.paymentDate} <= ${dateTo}`);
      if (guardianId) conditions.push(eq(schema.payments.guardianId, guardianId));
      if (method) conditions.push(eq(schema.payments.paymentMethod, method));
      if (status) conditions.push(eq(schema.payments.status, status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = Number(
        (await db.select({ count: count() }).from(schema.payments).where(where))[0]?.count ?? 0,
      );

      const payments = await db
        .select({
          id: schema.payments.id,
          guardianId: schema.payments.guardianId,
          playerId: schema.payments.playerId,
          guardianName: schema.guardians.name,
          playerName: schema.players.name,
          totalAmount: schema.payments.totalAmount,
          paymentDate: schema.payments.paymentDate,
          paymentMethod: schema.payments.paymentMethod,
          status: schema.payments.status,
          source: schema.payments.source,
          receiptNumber: schema.payments.receiptNumber,
          reference: schema.payments.reference,
          notes: schema.payments.notes,
        })
        .from(schema.payments)
        .leftJoin(schema.guardians, eq(schema.payments.guardianId, schema.guardians.id))
        .leftJoin(schema.players, eq(schema.payments.playerId, schema.players.id))
        .where(where)
        .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        payments: payments.map((p) => ({
          ...p,
          // Un pago siempre tiene tutor o socio, nunca los dos.
          payerName: p.guardianName ?? p.playerName ?? "Sin identificar",
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const payment = (
        await db.select().from(schema.payments).where(eq(schema.payments.id, input.id)).limit(1)
      )[0];

      if (!payment) return null;

      const quotas = await db
        .select({
          quotaId: schema.paymentQuotas.quotaId,
          amount: schema.paymentQuotas.amount,
          playerName: schema.players.name,
          month: schema.quotas.month,
          year: schema.quotas.year,
          totalAmount: schema.quotas.totalAmount,
        })
        .from(schema.paymentQuotas)
        .innerJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(eq(schema.paymentQuotas.paymentId, input.id));

      return { ...payment, quotas };
    }),

  /**
   * Cuotas impagas de un pagador, listas para cobrar en el mostrador.
   *
   * Devuelve también las que ya tienen un pago informado desde el portal
   * esperando confirmación, marcadas con `awaitingReview`, para que la
   * secretaría no las cobre dos veces sin darse cuenta.
   */
  pendingQuotasFor: staffProcedure
    .input(z.object({ payer: payerSchema }))
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const playerIds = await playerIdsForPayer(db, input.payer as Payer);
      if (playerIds.length === 0) return { quotas: [], totalPending: 0 };

      const quotas = await db
        .select({
          id: schema.quotas.id,
          playerId: schema.quotas.playerId,
          playerName: schema.players.name,
          month: schema.quotas.month,
          year: schema.quotas.year,
          baseAmount: schema.quotas.baseAmount,
          discountAmount: schema.quotas.discountAmount,
          interestAmount: schema.quotas.interestAmount,
          totalAmount: schema.quotas.totalAmount,
          dueDate: schema.quotas.dueDate,
          status: schema.quotas.status,
        })
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(
          and(
            inArray(schema.quotas.playerId, playerIds),
            inArray(schema.quotas.status, ["pending", "overdue"]),
          ),
        )
        .orderBy(schema.players.name, schema.quotas.year, schema.quotas.month);

      const awaiting = quotas.length
        ? new Set(
            (
              await db
                .select({ quotaId: schema.paymentQuotas.quotaId })
                .from(schema.paymentQuotas)
                .innerJoin(schema.payments, eq(schema.paymentQuotas.paymentId, schema.payments.id))
                .where(
                  and(
                    inArray(
                      schema.paymentQuotas.quotaId,
                      quotas.map((q) => q.id),
                    ),
                    eq(schema.payments.status, "pending_review"),
                  ),
                )
            ).map((r) => r.quotaId),
          )
        : new Set<number>();

      return {
        quotas: quotas.map((q) => ({ ...q, awaitingReview: awaiting.has(q.id) })),
        totalPending: quotas.reduce((sum, q) => sum + q.totalAmount, 0),
      };
    }),

  /**
   * Cobro mostrador. Queda confirmado en el acto.
   *
   * El importe **no llega desde el navegador**: se calcula sumando las cuotas
   * seleccionadas, que además se validan contra el pagador.
   */
  register: staffProcedure
    .input(
      z.object({
        payer: payerSchema,
        quotaIds: z.array(z.number().int().positive()).min(1, "Elegí al menos una cuota"),
        paymentMethod: z.enum(["cash", "transfer", "mercadopago"]),
        paymentDate: dateSchema.optional(),
        reference: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const payment = await registerPayment(getDb(), {
        payer: input.payer as Payer,
        quotaIds: input.quotaIds,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        reference: input.reference,
        notes: input.notes,
        createdBy: staffId(ctx.user),
      });
      return { payment };
    }),

  // ─── Bandeja de pagos informados desde el portal ───────────────────────────

  /**
   * Pagos que informaron los socios y todavía nadie revisó.
   *
   * Esta es la conexión entre el portal y el CRM: el socio avisa que transfirió,
   * acá se ve con el detalle de qué cuotas cubre, y al confirmar se saldan las
   * cuotas y el importe entra al cierre de caja del día.
   */
  pendingReview: staffProcedure.query(async () => {
    const db = getDb();

    const payments = await db
      .select({
        id: schema.payments.id,
        guardianName: schema.guardians.name,
        playerName: schema.players.name,
        guardianPhone: schema.guardians.phone,
        playerPhone: schema.players.phone,
        totalAmount: schema.payments.totalAmount,
        paymentDate: schema.payments.paymentDate,
        paymentMethod: schema.payments.paymentMethod,
        reference: schema.payments.reference,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .leftJoin(schema.guardians, eq(schema.payments.guardianId, schema.guardians.id))
      .leftJoin(schema.players, eq(schema.payments.playerId, schema.players.id))
      .where(eq(schema.payments.status, "pending_review"))
      .orderBy(schema.payments.paymentDate, schema.payments.id);

    if (payments.length === 0) return { payments: [], totalAmount: 0 };

    const details = await db
      .select({
        paymentId: schema.paymentQuotas.paymentId,
        quotaId: schema.quotas.id,
        playerName: schema.players.name,
        month: schema.quotas.month,
        year: schema.quotas.year,
        totalAmount: schema.quotas.totalAmount,
        status: schema.quotas.status,
      })
      .from(schema.paymentQuotas)
      .innerJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
      .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .where(
        inArray(
          schema.paymentQuotas.paymentId,
          payments.map((p) => p.id),
        ),
      );

    return {
      payments: payments.map((p) => {
        const quotas = details.filter((d) => d.paymentId === p.id);
        return {
          ...p,
          payerName: p.guardianName ?? p.playerName ?? "Sin identificar",
          phone: p.guardianPhone ?? p.playerPhone ?? null,
          quotas,
          /** Aviso para la secretaría: alguna cuota ya se cobró por otra vía. */
          hasConflict: quotas.some((q) => q.status === "paid"),
        };
      }),
      totalAmount: payments.reduce((sum, p) => sum + p.totalAmount, 0),
    };
  }),

  /** Cantidad de pagos esperando revisión. Alimenta el badge del menú. */
  pendingReviewCount: staffProcedure.query(async () => {
    const db = getDb();
    const row = (
      await db
        .select({ count: count() })
        .from(schema.payments)
        .where(eq(schema.payments.status, "pending_review"))
    )[0];
    return Number(row?.count ?? 0);
  }),

  confirm: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => confirmPayment(getDb(), input.id, staffId(ctx.user))),

  reject: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      rejectPayment(getDb(), input.id, staffId(ctx.user), input.reason),
    ),

  /** Total cobrado a una familia. Se usa en la ficha del tutor. */
  getStatsByGuardian: staffProcedure
    .input(z.object({ guardianId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = (
        await db
          .select({ total: sum(schema.payments.totalAmount) })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.guardianId, input.guardianId),
              eq(schema.payments.status, "confirmed"),
            ),
          )
      )[0];
      return { totalPaid: Number(row?.total ?? 0) };
    }),
});
