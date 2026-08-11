import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DbClient } from "../queries/connection";
import { addDays, buildDate, daysBetween, today as todayInClub } from "../lib/dates";
import { getSettings } from "./settings";

/**
 * Reglas de negocio de las cuotas.
 *
 * Las funciones de arriba son puras (no tocan la base) para poder testearlas;
 * las de abajo aplican esas reglas sobre la base.
 */

// ─── Cálculos puros ──────────────────────────────────────────────────────────

export type InterestInput = {
  /** Monto de lista de la cuota. */
  baseAmount: number;
  /** Descuento por hermanos, en pesos. */
  discountAmount: number;
  /** Vencimiento, `YYYY-MM-DD`. */
  dueDate: string;
  /** Fecha contra la que se calcula, `YYYY-MM-DD`. */
  today: string;
  /** Interés diario en porcentaje (0.5 = 0,5 % por día). */
  dailyRatePercent: number;
  /** Días de tolerancia después del vencimiento. */
  graceDays: number;
};

export type InterestResult = {
  /** Días de atraso ya descontada la tolerancia. 0 si todavía no corresponde. */
  overdueDays: number;
  /** Interés acumulado, en pesos enteros. */
  interest: number;
};

/**
 * Interés por mora.
 *
 * Se calcula sobre el **monto neto** (base menos descuento), que es lo que la
 * familia realmente debe. Antes se calculaba sobre el monto de lista, así que
 * una familia con descuento por hermanos pagaba más interés del que le tocaba.
 *
 * El interés es simple, no compuesto: `neto × tasa diaria × días de atraso`.
 */
export function calculateInterest(input: InterestInput): InterestResult {
  const { baseAmount, discountAmount, dueDate, today, dailyRatePercent, graceDays } = input;

  const graceDue = addDays(dueDate, graceDays);
  const overdueDays = daysBetween(graceDue, today);

  if (overdueDays <= 0 || dailyRatePercent <= 0) {
    return { overdueDays: 0, interest: 0 };
  }

  const net = Math.max(0, baseAmount - discountAmount);
  const interest = Math.round(net * (dailyRatePercent / 100) * overdueDays);
  return { overdueDays, interest };
}

/** Total a pagar de una cuota. Es la única fórmula válida en todo el sistema. */
export function quotaTotal(baseAmount: number, discountAmount: number, interestAmount: number): number {
  return Math.max(0, baseAmount - discountAmount + interestAmount);
}

export type DiscountInput = {
  baseAmount: number;
  /** Cantidad de socios activos de la misma familia (incluye al propio). */
  siblingCount: number;
  /** Descuento definido en la categoría. */
  categoryDiscountPercent: number;
  /** Descuento global, se usa si la categoría no define uno. */
  fallbackPercent: number;
  /** Interruptor global de descuentos. */
  discountEnabled: boolean;
};

/**
 * Descuento por hermanos, en pesos.
 *
 * Sólo se aplica si la familia tiene 2 o más socios activos. Antes se aplicaba
 * el descuento aunque el chico fuera hijo único, siempre que la categoría
 * tuviera un porcentaje cargado.
 */
export function calculateSiblingDiscount(input: DiscountInput): number {
  const { baseAmount, siblingCount, categoryDiscountPercent, fallbackPercent, discountEnabled } = input;

  if (!discountEnabled || siblingCount < 2) return 0;

  const percent = categoryDiscountPercent > 0 ? categoryDiscountPercent : fallbackPercent;
  if (percent <= 0) return 0;

  return Math.round(baseAmount * (Math.min(percent, 100) / 100));
}

// ─── Operaciones sobre la base ───────────────────────────────────────────────

export type OverdueSyncResult = {
  /** Cuotas que pasaron de `pending` a `overdue` en esta corrida. */
  markedOverdue: number;
  /** Cuotas cuyo interés se actualizó. */
  interestUpdated: number;
};

/**
 * Pone al día el estado y el interés de las cuotas impagas.
 *
 * Antes **ninguna cuota pasaba nunca a "vencida"**: el único código que escribía
 * ese estado era el seed. Por eso la pantalla de Deudores aparecía vacía, el KPI
 * de deudores daba 0 y los intereses nunca se guardaban.
 *
 * Corre en dos pasos, cada uno con una sola sentencia SQL:
 *
 *  1. Marca como `overdue` toda cuota `pending` cuyo vencimiento + días de
 *     gracia ya pasó.
 *  2. Recalcula el interés y el total de todas las cuotas `overdue`.
 *
 * En Postgres la resta de dos `date` da directamente la cantidad de días, así
 * que el cálculo queda mucho más simple que con el `julianday()` de SQLite.
 *
 * Es idempotente: llamarla dos veces seguidas no cambia nada.
 */
export async function syncOverdueQuotas(db: DbClient): Promise<OverdueSyncResult> {
  const settings = await getSettings(db);
  const now = todayInClub();
  // Última fecha que todavía se considera "en término".
  const lastGraceDate = addDays(now, -settings.graceDays);

  const marked = await db
    .update(schema.quotas)
    .set({ status: "overdue" })
    .where(and(eq(schema.quotas.status, "pending"), sql`${schema.quotas.dueDate} < ${lastGraceDate}`))
    .returning({ id: schema.quotas.id });

  // Días de atraso: días transcurridos desde el vencimiento menos la tolerancia,
  // con piso en 0.
  const overdueDays = sql`GREATEST(0, (${now}::date - "dueDate") - ${settings.graceDays})`;
  const netAmount = sql`GREATEST(0, "baseAmount" - "discountAmount")`;
  const interest = sql`ROUND(${netAmount} * ${settings.interestRate}::numeric / 100 * ${overdueDays})::integer`;

  const updated = await db
    .update(schema.quotas)
    .set({
      interestAmount: interest,
      totalAmount: sql`${netAmount} + ${interest}`,
    })
    .where(
      and(
        eq(schema.quotas.status, "overdue"),
        // Sólo toca las filas que realmente cambian, para no escribir de más.
        sql`(${schema.quotas.interestAmount} IS DISTINCT FROM ${interest}
          OR ${schema.quotas.totalAmount} IS DISTINCT FROM ${netAmount} + ${interest})`,
      ),
    )
    .returning({ id: schema.quotas.id });

  return {
    markedOverdue: marked.length,
    interestUpdated: updated.length,
  };
}

export type GenerateQuotasResult = {
  created: number;
  skippedExisting: number;
  skippedNoQuotaCategory: number;
  /** Categorías de socios activos que no existen en la tabla `categories`. */
  missingCategories: string[];
};

/**
 * Genera las cuotas de un mes para todos los socios activos.
 *
 * Reglas:
 *
 * - Los montos salen de `categories`, la única fuente de verdad. Antes salían de
 *   `quota_configs`, que tenía categorías distintas de las que usaban los socios:
 *   a quien no matcheaba se le cobraba un valor fijo de $50.000 hardcodeado.
 * - Se respeta `paysQuota`: a las categorías marcadas como "no paga cuota" ya no
 *   se les genera nada.
 * - El descuento por hermanos sólo se aplica si hay 2 o más socios activos.
 * - Si una categoría no está cargada, no se inventa un monto: se saltea al socio
 *   y se devuelve la lista para avisar en pantalla.
 *
 * Corre entera dentro de una transacción, así que o se generan todas o ninguna.
 */
export async function generateMonthlyQuotas(
  db: DbClient,
  params: { month: number; year: number; dueDay?: number },
): Promise<GenerateQuotasResult> {
  const settings = await getSettings(db);
  const dueDay = params.dueDay ?? settings.dueDay;
  const dueDate = buildDate(params.year, params.month, dueDay);

  const activePlayers = await db
    .select({
      id: schema.players.id,
      category: schema.players.category,
      guardianId: schema.players.guardianId,
    })
    .from(schema.players)
    .where(eq(schema.players.status, "active"));

  const categories = await db.select().from(schema.categories);
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // Socios activos por tutor, para saber quién tiene hermanos.
  const siblingCounts = new Map<number, number>();
  for (const player of activePlayers) {
    if (player.guardianId == null) continue;
    siblingCounts.set(player.guardianId, (siblingCounts.get(player.guardianId) ?? 0) + 1);
  }

  const existing = await db
    .select({ playerId: schema.quotas.playerId })
    .from(schema.quotas)
    .where(and(eq(schema.quotas.month, params.month), eq(schema.quotas.year, params.year)));
  const alreadyHasQuota = new Set(existing.map((e) => e.playerId));

  const result: GenerateQuotasResult = {
    created: 0,
    skippedExisting: 0,
    skippedNoQuotaCategory: 0,
    missingCategories: [],
  };
  const missing = new Set<string>();
  const toInsert: (typeof schema.quotas.$inferInsert)[] = [];

  for (const player of activePlayers) {
    if (alreadyHasQuota.has(player.id)) {
      result.skippedExisting++;
      continue;
    }

    const category = categoryByName.get(player.category);
    if (!category) {
      missing.add(player.category);
      continue;
    }
    if (!category.paysQuota || category.baseAmount <= 0) {
      result.skippedNoQuotaCategory++;
      continue;
    }

    const siblingCount = player.guardianId == null ? 1 : (siblingCounts.get(player.guardianId) ?? 1);
    const discountAmount = calculateSiblingDiscount({
      baseAmount: category.baseAmount,
      siblingCount,
      categoryDiscountPercent: category.siblingDiscountPercent,
      fallbackPercent: settings.discountPercent,
      discountEnabled: settings.discountEnabled,
    });

    toInsert.push({
      playerId: player.id,
      month: params.month,
      year: params.year,
      baseAmount: category.baseAmount,
      discountAmount,
      interestAmount: 0,
      totalAmount: quotaTotal(category.baseAmount, discountAmount, 0),
      dueDate,
      status: "pending",
    });
  }

  // Un solo INSERT con todas las filas: contra una base remota, insertar de a
  // una sería un viaje de ida y vuelta por socio.
  if (toInsert.length > 0) {
    await db.insert(schema.quotas).values(toInsert);
    result.created = toInsert.length;
  }

  result.missingCategories = [...missing];
  return result;
}

/** Cuotas impagas de un conjunto de socios. Útil para varias pantallas. */
export async function pendingQuotasForPlayers(db: DbClient, playerIds: number[]) {
  if (playerIds.length === 0) return [];
  return db
    .select()
    .from(schema.quotas)
    .where(
      and(
        inArray(schema.quotas.playerId, playerIds),
        inArray(schema.quotas.status, ["pending", "overdue"]),
      ),
    );
}
