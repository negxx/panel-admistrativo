import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Db, DbClient } from "../queries/connection";
import { today as todayInClub } from "../lib/dates";
import { nextReceiptNumber } from "./receipts";
import { refreshClosure } from "./cash";
import { syncOverdueQuotas } from "./quotas";

/**
 * Registro y confirmación de pagos.
 *
 * Reglas que se aplican en todos los caminos:
 *
 *  1. **Los ids de cuota se validan siempre contra el pagador.** No alcanza con
 *     que la cuota exista: tiene que pertenecer al tutor o al socio que paga. Sin
 *     esto, cualquiera podía saldar la cuota de otra familia mandando ids sueltos.
 *  2. **El importe lo calcula el servidor**, nunca llega desde el navegador.
 *  3. **Todo corre dentro de una transacción.** Antes el pago, el vínculo con las
 *     cuotas y la actualización de caja eran operaciones sueltas: si una fallaba,
 *     quedaban cuotas pagadas sin pago asociado.
 *  4. **Una cuota ya pagada no se vuelve a cobrar.**
 *
 * Todo es asíncrono: con Postgres cada consulta es un viaje por red. Dentro de
 * `db.transaction(async tx => ...)` hay que esperar **todas** las operaciones —
 * un `await` olvidado deja la consulta afuera de la transacción.
 */

// ─── Identidad de quien paga ─────────────────────────────────────────────────

export type Payer =
  | { kind: "guardian"; id: number }
  | { kind: "player"; id: number };

/**
 * Devuelve los ids de socio que le corresponden al pagador.
 * Un tutor puede pagar por todos sus hijos; un socio sin tutor, sólo por sí mismo.
 */
export async function playerIdsForPayer(db: DbClient, payer: Payer): Promise<number[]> {
  if (payer.kind === "player") {
    const rows = await db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(and(eq(schema.players.id, payer.id), isNull(schema.players.guardianId)))
      .limit(1);
    return rows.map((p) => p.id);
  }

  const rows = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(schema.players.guardianId, payer.id));
  return rows.map((p) => p.id);
}

// ─── Validación de las cuotas a pagar ────────────────────────────────────────

export type PayableQuota = {
  id: number;
  playerId: number;
  totalAmount: number;
  status: string;
};

/**
 * Trae las cuotas indicadas verificando que sean cobrables y del pagador.
 * Lanza si alguna no existe, ya está paga o es de otra persona.
 */
export async function loadPayableQuotas(
  db: DbClient,
  payer: Payer,
  quotaIds: number[],
): Promise<PayableQuota[]> {
  if (quotaIds.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No seleccionaste ninguna cuota" });
  }

  const uniqueIds = [...new Set(quotaIds)];
  const ownPlayerIds = await playerIdsForPayer(db, payer);

  if (ownPlayerIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No hay socios asociados a esta cuenta" });
  }

  const quotas = await db
    .select({
      id: schema.quotas.id,
      playerId: schema.quotas.playerId,
      totalAmount: schema.quotas.totalAmount,
      status: schema.quotas.status,
    })
    .from(schema.quotas)
    // `inArray` expande los ids como corresponde. Antes se usaba
    // sql`id IN (${ids.join(",")})`, que Drizzle mandaba como UN solo parámetro
    // con el texto "1,2,3": con más de una cuota no matcheaba ninguna fila y el
    // pago se registraba en $0 aunque las cuotas quedaran marcadas como pagas.
    .where(inArray(schema.quotas.id, uniqueIds));

  if (quotas.length !== uniqueIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Alguna de las cuotas ya no existe" });
  }

  const allowed = new Set(ownPlayerIds);
  for (const quota of quotas) {
    if (!allowed.has(quota.playerId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Hay cuotas que no pertenecen a este socio",
      });
    }
    if (quota.status === "paid") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Hay cuotas que ya figuran pagadas. Actualizá la pantalla.",
      });
    }
  }

  return quotas;
}

/** Cuotas que ya están comprometidas en un pago pendiente de confirmación. */
export async function quotasAwaitingReview(db: DbClient, quotaIds: number[]): Promise<number[]> {
  if (quotaIds.length === 0) return [];
  const rows = await db
    .select({ quotaId: schema.paymentQuotas.quotaId })
    .from(schema.paymentQuotas)
    .innerJoin(schema.payments, eq(schema.paymentQuotas.paymentId, schema.payments.id))
    .where(
      and(
        inArray(schema.paymentQuotas.quotaId, quotaIds),
        eq(schema.payments.status, "pending_review"),
      ),
    );
  return rows.map((r) => r.quotaId);
}

// ─── Alta de pagos ───────────────────────────────────────────────────────────

export type RegisterPaymentInput = {
  payer: Payer;
  quotaIds: number[];
  paymentMethod: "cash" | "transfer" | "mercadopago";
  notes?: string;
  reference?: string;
  /** Usuario del panel que carga el pago. */
  createdBy: number | null;
  /** Fecha del pago. Por defecto, hoy. */
  paymentDate?: string;
};

/**
 * Registra un pago cobrado por la secretaría. Queda confirmado en el acto:
 * saldan las cuotas, se emite recibo y se actualiza el cierre de caja del día.
 */
export function registerPayment(db: Db, input: RegisterPaymentInput) {
  return db.transaction(async (tx) => {
    const quotas = await loadPayableQuotas(tx, input.payer, input.quotaIds);
    const date = input.paymentDate ?? todayInClub();
    const totalAmount = quotas.reduce((sum, q) => sum + q.totalAmount, 0);
    const receiptNumber = await nextReceiptNumber(tx, Number(date.slice(0, 4)));

    const payment = (
      await tx
        .insert(schema.payments)
        .values({
          guardianId: input.payer.kind === "guardian" ? input.payer.id : null,
          playerId: input.payer.kind === "player" ? input.payer.id : null,
          totalAmount,
          paymentDate: date,
          paymentMethod: input.paymentMethod,
          status: "confirmed",
          source: "panel",
          receiptNumber,
          reference: input.reference,
          notes: input.notes,
          createdBy: input.createdBy,
        })
        .returning()
    )[0];

    await linkQuotasToPayment(tx, payment.id, quotas);
    await markQuotasPaid(tx, quotas, date, input.paymentMethod, receiptNumber);
    await refreshClosure(tx, date);

    return payment;
  });
}

export type ReportPaymentInput = {
  payer: Payer;
  quotaIds: number[];
  paymentMethod: "transfer" | "mercadopago";
  /** Número de operación / comprobante que informa el socio. */
  reference?: string;
};

/**
 * El socio informa un pago desde el portal.
 *
 * **No salda la cuota.** Queda como `pending_review` hasta que alguien del club
 * lo confirma en la pantalla "Pagos a confirmar". Antes el portal marcaba la
 * cuota como pagada apenas el socio apretaba el botón, sin que entrara un peso:
 * cualquiera podía dejar su cuenta al día solo.
 */
export function reportPortalPayment(db: Db, input: ReportPaymentInput) {
  return db.transaction(async (tx) => {
    const quotas = await loadPayableQuotas(tx, input.payer, input.quotaIds);

    const duplicated = await quotasAwaitingReview(
      tx,
      quotas.map((q) => q.id),
    );
    if (duplicated.length > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Ya informaste un pago para alguna de estas cuotas. Esperá la confirmación del club.",
      });
    }

    const date = todayInClub();
    const totalAmount = quotas.reduce((sum, q) => sum + q.totalAmount, 0);

    const payment = (
      await tx
        .insert(schema.payments)
        .values({
          guardianId: input.payer.kind === "guardian" ? input.payer.id : null,
          playerId: input.payer.kind === "player" ? input.payer.id : null,
          totalAmount,
          paymentDate: date,
          paymentMethod: input.paymentMethod,
          status: "pending_review",
          source: "portal",
          // El recibo se emite recién al confirmar, para no gastar numeración en
          // pagos que terminan rechazados.
          receiptNumber: null,
          reference: input.reference,
        })
        .returning()
    )[0];

    await linkQuotasToPayment(tx, payment.id, quotas);
    return payment;
  });
}

// ─── Revisión de pagos informados ────────────────────────────────────────────

/**
 * Confirma un pago informado desde el portal: recién acá saldan las cuotas, se
 * emite el número de recibo y el importe entra al cierre de caja.
 */
export function confirmPayment(db: Db, paymentId: number, reviewerId: number | null) {
  return db.transaction(async (tx) => {
    const payment = await loadPendingPayment(tx, paymentId);

    const linked = await tx
      .select({
        id: schema.quotas.id,
        playerId: schema.quotas.playerId,
        totalAmount: schema.quotas.totalAmount,
        status: schema.quotas.status,
      })
      .from(schema.paymentQuotas)
      .innerJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
      .where(eq(schema.paymentQuotas.paymentId, paymentId));

    const alreadyPaid = linked.filter((q) => q.status === "paid");
    if (alreadyPaid.length > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Alguna de las cuotas ya fue cobrada por otra vía. Revisá antes de confirmar.",
      });
    }

    const receiptNumber = await nextReceiptNumber(tx, Number(payment.paymentDate.slice(0, 4)));
    // El importe se recalcula al confirmar: si mientras tanto corrió interés por
    // mora, el pago refleja lo que realmente se cobró.
    const totalAmount = linked.reduce((sum, q) => sum + q.totalAmount, 0);

    await tx
      .update(schema.payments)
      .set({
        status: "confirmed",
        totalAmount,
        receiptNumber,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(schema.payments.id, paymentId));

    for (const quota of linked) {
      await tx
        .update(schema.paymentQuotas)
        .set({ amount: quota.totalAmount })
        .where(
          and(
            eq(schema.paymentQuotas.paymentId, paymentId),
            eq(schema.paymentQuotas.quotaId, quota.id),
          ),
        );
    }

    await markQuotasPaid(tx, linked, payment.paymentDate, payment.paymentMethod, receiptNumber);
    await refreshClosure(tx, payment.paymentDate);

    return { success: true as const, receiptNumber, totalAmount };
  });
}

/** Rechaza un pago informado. Las cuotas quedan impagas y vuelven a estar disponibles. */
export function rejectPayment(
  db: Db,
  paymentId: number,
  reviewerId: number | null,
  reason?: string,
) {
  return db.transaction(async (tx) => {
    const payment = await loadPendingPayment(tx, paymentId);

    await tx
      .update(schema.payments)
      .set({
        status: "rejected",
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        notes: reason ?? payment.notes,
      })
      .where(eq(schema.payments.id, paymentId));

    return { success: true as const };
  });
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function loadPendingPayment(tx: DbClient, paymentId: number) {
  const payment = (
    await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1)
  )[0];

  if (!payment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "El pago no existe" });
  }
  if (payment.status !== "pending_review") {
    throw new TRPCError({ code: "CONFLICT", message: "Este pago ya fue revisado" });
  }
  return payment;
}

async function linkQuotasToPayment(
  tx: DbClient,
  paymentId: number,
  quotas: PayableQuota[],
): Promise<void> {
  // Un solo INSERT con todas las filas, en vez de uno por cuota.
  await tx.insert(schema.paymentQuotas).values(
    quotas.map((quota) => ({
      paymentId,
      quotaId: quota.id,
      amount: quota.totalAmount,
    })),
  );
}

async function markQuotasPaid(
  tx: DbClient,
  quotas: Array<{ id: number }>,
  paymentDate: string,
  paymentMethod: "cash" | "transfer" | "mercadopago",
  receiptNumber: string,
): Promise<void> {
  await tx
    .update(schema.quotas)
    .set({ status: "paid", paymentDate, paymentMethod, receiptNumber })
    .where(
      inArray(
        schema.quotas.id,
        quotas.map((q) => q.id),
      ),
    );
}

/**
 * Deuda total de un pagador, ya puesta al día (marca vencidas y recalcula
 * intereses antes de sumar).
 */
export async function pendingSummaryFor(db: Db, payer: Payer) {
  await syncOverdueQuotas(db);
  const playerIds = await playerIdsForPayer(db, payer);
  if (playerIds.length === 0) return { totalPending: 0, quotaCount: 0 };

  const row = (
    await db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.quotas.totalAmount}), 0)::integer`,
        count: sql<number>`COUNT(*)::integer`,
      })
      .from(schema.quotas)
      .where(
        and(
          inArray(schema.quotas.playerId, playerIds),
          inArray(schema.quotas.status, ["pending", "overdue"]),
        ),
      )
  )[0];

  return { totalPending: Number(row?.total ?? 0), quotaCount: Number(row?.count ?? 0) };
}
