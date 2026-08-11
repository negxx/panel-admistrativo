import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, portalProcedure, publicProcedure } from "../middleware";
import { getDb, type Db } from "../queries/connection";
import { hashSecret, needsRehash, verifySecret } from "../lib/crypto";
import { checkRateLimit, clearAttempts, PIN_LIMIT, registerFailure } from "../lib/rate-limit";
import {
  buildPortalCookie,
  buildPortalLogoutCookie,
  signPortalToken,
  type PortalIdentity,
} from "../lib/portal-session";
import { getPublicBankInfo } from "../domain/settings";
import { syncOverdueQuotas } from "../domain/quotas";
import { reportPortalPayment, type Payer } from "../domain/payments";

/**
 * Portal público de socios.
 *
 * Reescrito de punta a punta por dos motivos de seguridad:
 *
 *  1. **La identidad ya no viaja en el input.** Antes cada endpoint recibía un
 *     `guardianId` desde el navegador y confiaba en él: cambiando ese número en
 *     la consola se veía la deuda de otra familia y se podía pagar en su nombre.
 *     Ahora sale de una cookie firmada (ver `api/lib/portal-session.ts`) y el
 *     frontend no manda ningún id.
 *  2. **Activar el PIN pide una prueba de identidad.** Antes `setPin` dejaba
 *     fijar el PIN de cualquier DNI sin verificar nada, así que con un DNI
 *     alcanzaba para entrar a la cuenta ajena.
 */

const dniSchema = z
  .string()
  .trim()
  .min(6, "El DNI es muy corto")
  .max(15)
  .regex(/^[0-9.]+$/, "El DNI sólo lleva números")
  .transform((value) => value.replace(/\./g, ""));

const pinSchema = z.string().regex(/^\d{4}$/, "El PIN son 4 números");

export const portalRouter = createRouter({
  /** Datos bancarios y nombre del club. Lo único público sin identificarse. */
  bankInfo: publicProcedure.query(() => getPublicBankInfo(getDb())),

  /**
   * Primer paso del ingreso: dice si el DNI está en el club y si ya tiene PIN.
   *
   * A propósito **no devuelve el nombre**: con un endpoint público que devuelve
   * nombres se puede barrer el padrón probando DNIs. El saludo personalizado se
   * muestra recién después de validar el PIN.
   */
  lookup: publicProcedure.input(z.object({ dni: dniSchema })).mutation(async ({ input }) => {
    const account = await findAccountByDni(getDb(), input.dni);
    if (!account) return { found: false as const };
    return { found: true as const, needsActivation: !account.pin };
  }),

  /**
   * Activación del PIN la primera vez.
   *
   * Pide la fecha de nacimiento del socio como prueba de identidad: es un dato
   * que la familia conoce y que no figura en ninguna pantalla pública. Para un
   * tutor vale la fecha de nacimiento de cualquiera de sus hijos activos.
   *
   * Si el PIN ya estaba configurado, este endpoint no sirve para cambiarlo: hay
   * que usar `changePin` (que pide el PIN actual) o pedirle un blanqueo al club.
   */
  activate: publicProcedure
    .input(z.object({ dni: dniSchema, birthDate: z.string(), pin: pinSchema }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rateKey = `portal-activate:${input.dni}`;
      await assertNotRateLimited(db, rateKey);

      const account = await findAccountByDni(db, input.dni);
      if (!account || account.pin) {
        await registerFailure(db, rateKey, PIN_LIMIT);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pudimos activar el acceso. Acercate a secretaría del club.",
        });
      }

      if (!(await birthDateMatches(db, account, input.birthDate))) {
        await registerFailure(db, rateKey, PIN_LIMIT);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "La fecha de nacimiento no coincide con nuestros registros",
        });
      }

      await clearAttempts(db, rateKey);
      return savePin(db, account, input.pin);
    }),

  /** Ingreso con DNI + PIN. Deja la cookie de sesión del portal. */
  login: publicProcedure
    .input(z.object({ dni: dniSchema, pin: pinSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rateKey = `portal-login:${input.dni}`;
      await assertNotRateLimited(db, rateKey);

      const account = await findAccountByDni(db, input.dni);
      const pinOk = account ? await verifySecret(input.pin, account.pin) : false;

      if (!account || !pinOk) {
        await registerFailure(db, rateKey, PIN_LIMIT);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "DNI o PIN incorrectos" });
      }

      await clearAttempts(db, rateKey);

      // Los PIN viejos estaban guardados en texto plano: se re-hashean solos.
      if (needsRehash(account.pin)) {
        await savePin(db, account, input.pin);
      }

      const identity: PortalIdentity = { kind: account.kind, id: account.id };
      const token = await signPortalToken(identity);
      ctx.resHeaders.append("set-cookie", buildPortalCookie(ctx.req.headers, token));

      return { success: true, name: account.name };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.resHeaders.append("set-cookie", buildPortalLogoutCookie(ctx.req.headers));
    return { success: true };
  }),

  /** Quién está logueado en el portal. Devuelve `null` si no hay sesión. */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.portal) return null;
    const account = await findAccountById(getDb(), ctx.portal);
    if (!account) return null;
    return { kind: account.kind, name: account.name };
  }),

  /**
   * Todo lo que muestra el portal, en una sola consulta: socios a cargo, cuotas
   * pendientes, pagos informados esperando confirmación e historial.
   *
   * Antes eran cuatro endpoints separados y uno de ellos, el historial, se
   * llamaba siempre con `guardianId` incluso cuando quien entraba era un socio
   * sin tutor: si existía un tutor con ese mismo id, el socio veía los pagos de
   * esa otra familia.
   */
  dashboard: portalProcedure.query(async ({ ctx }) => {
    const db = getDb();
    await syncOverdueQuotas(db);

    const account = await findAccountById(db, ctx.portal);
    if (!account) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Tu cuenta ya no está disponible" });
    }

    const members = await db
      .select({
        id: schema.players.id,
        name: schema.players.name,
        dni: schema.players.dni,
        category: schema.players.category,
        status: schema.players.status,
      })
      .from(schema.players)
      .where(
        ctx.portal.kind === "guardian"
          ? and(eq(schema.players.guardianId, ctx.portal.id), eq(schema.players.status, "active"))
          : eq(schema.players.id, ctx.portal.id),
      )
      .orderBy(schema.players.name);

    const memberIds = members.map((m) => m.id);

    const quotas = memberIds.length
      ? await db
          .select({
            id: schema.quotas.id,
            playerId: schema.quotas.playerId,
            month: schema.quotas.month,
            year: schema.quotas.year,
            baseAmount: schema.quotas.baseAmount,
            discountAmount: schema.quotas.discountAmount,
            interestAmount: schema.quotas.interestAmount,
            totalAmount: schema.quotas.totalAmount,
            dueDate: schema.quotas.dueDate,
            status: schema.quotas.status,
            paymentDate: schema.quotas.paymentDate,
            receiptNumber: schema.quotas.receiptNumber,
          })
          .from(schema.quotas)
          .where(inArray(schema.quotas.playerId, memberIds))
          .orderBy(desc(schema.quotas.year), desc(schema.quotas.month))
      : [];

    const payments = await db
      .select({
        id: schema.payments.id,
        totalAmount: schema.payments.totalAmount,
        paymentDate: schema.payments.paymentDate,
        paymentMethod: schema.payments.paymentMethod,
        status: schema.payments.status,
        receiptNumber: schema.payments.receiptNumber,
        reference: schema.payments.reference,
      })
      .from(schema.payments)
      .where(
        ctx.portal.kind === "guardian"
          ? eq(schema.payments.guardianId, ctx.portal.id)
          : eq(schema.payments.playerId, ctx.portal.id),
      )
      .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.id))
      .limit(30);

    const paymentIds = payments.map((p) => p.id);
    const paymentDetails = paymentIds.length
      ? await db
          .select({
            paymentId: schema.paymentQuotas.paymentId,
            playerName: schema.players.name,
            month: schema.quotas.month,
            year: schema.quotas.year,
          })
          .from(schema.paymentQuotas)
          .innerJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
          .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
          .where(inArray(schema.paymentQuotas.paymentId, paymentIds))
      : [];

    const detailByPayment = new Map<
      number,
      Array<{ playerName: string; month: number; year: number }>
    >();
    for (const detail of paymentDetails) {
      const list = detailByPayment.get(detail.paymentId) ?? [];
      list.push({ playerName: detail.playerName, month: detail.month, year: detail.year });
      detailByPayment.set(detail.paymentId, list);
    }

    // Cuotas ya informadas y esperando confirmación: no se pueden volver a pagar
    // ni se cuentan como deuda a abonar en este momento.
    const quotasAwaitingReview = new Set(
      (
        await db
          .select({ quotaId: schema.paymentQuotas.quotaId })
          .from(schema.paymentQuotas)
          .innerJoin(schema.payments, eq(schema.paymentQuotas.paymentId, schema.payments.id))
          .where(
            and(
              eq(schema.payments.status, "pending_review"),
              ctx.portal.kind === "guardian"
                ? eq(schema.payments.guardianId, ctx.portal.id)
                : eq(schema.payments.playerId, ctx.portal.id),
            ),
          )
      ).map((r) => r.quotaId),
    );

    const membersWithQuotas = members.map((member) => {
      const own = quotas.filter((q) => q.playerId === member.id);
      const pending = own.filter((q) => q.status !== "paid");
      return {
        ...member,
        quotas: own,
        pendingQuotas: pending.map((q) => ({
          ...q,
          awaitingReview: quotasAwaitingReview.has(q.id),
        })),
        totalPending: pending
          .filter((q) => !quotasAwaitingReview.has(q.id))
          .reduce((sum, q) => sum + q.totalAmount, 0),
      };
    });

    return {
      account: { kind: account.kind, name: account.name },
      members: membersWithQuotas,
      /** Deuda exigible hoy: no incluye lo que ya está esperando confirmación. */
      totalPending: membersWithQuotas.reduce((sum, m) => sum + m.totalPending, 0),
      payments: payments.map((p) => ({
        ...p,
        detail: detailByPayment.get(p.id) ?? [],
      })),
      hasPendingReview: payments.some((p) => p.status === "pending_review"),
      bank: await getPublicBankInfo(db),
    };
  }),

  /**
   * El socio informa que pagó.
   *
   * Queda pendiente de confirmación: la cuota **no** se salda hasta que alguien
   * del club lo verifica. Antes bastaba con apretar el botón para que la cuota
   * figurara pagada sin que entrara un peso.
   */
  reportPayment: portalProcedure
    .input(
      z.object({
        quotaIds: z.array(z.number().int().positive()).min(1, "Elegí al menos una cuota"),
        paymentMethod: z.enum(["transfer", "mercadopago"]),
        reference: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const payment = await reportPortalPayment(getDb(), {
        payer: toPayer(ctx.portal),
        quotaIds: input.quotaIds,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
      });
      return {
        success: true,
        paymentId: payment.id,
        totalAmount: payment.totalAmount,
      };
    }),

  /** Cambio de PIN estando logueado. Pide el PIN actual. */
  changePin: portalProcedure
    .input(z.object({ currentPin: pinSchema, newPin: pinSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const account = await findAccountById(db, ctx.portal);
      if (!account || !(await verifySecret(input.currentPin, account.pin))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "El PIN actual no coincide" });
      }
      return savePin(db, account, input.newPin);
    }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PortalAccount = {
  kind: "guardian" | "player";
  id: number;
  name: string;
  pin: string | null;
};

/**
 * Busca la cuenta del portal por DNI.
 *
 * Primero como tutor; si no, como socio **sin tutor** (los socios que tienen
 * tutor entran con el DNI del tutor, no con el propio).
 */
async function findAccountByDni(db: Db, dni: string): Promise<PortalAccount | null> {
  const guardian = (
    await db
      .select({ id: schema.guardians.id, name: schema.guardians.name, pin: schema.guardians.pin })
      .from(schema.guardians)
      .where(eq(schema.guardians.dni, dni))
      .limit(1)
  )[0];

  if (guardian) return { kind: "guardian", ...guardian };

  const player = (
    await db
      .select({ id: schema.players.id, name: schema.players.name, pin: schema.players.pin })
      .from(schema.players)
      .where(
        and(
          eq(schema.players.dni, dni),
          isNull(schema.players.guardianId),
          eq(schema.players.status, "active"),
        ),
      )
      .limit(1)
  )[0];

  return player ? { kind: "player", ...player } : null;
}

async function findAccountById(db: Db, identity: PortalIdentity): Promise<PortalAccount | null> {
  if (identity.kind === "guardian") {
    const guardian = (
      await db
        .select({ id: schema.guardians.id, name: schema.guardians.name, pin: schema.guardians.pin })
        .from(schema.guardians)
        .where(eq(schema.guardians.id, identity.id))
        .limit(1)
    )[0];
    return guardian ? { kind: "guardian", ...guardian } : null;
  }

  const player = (
    await db
      .select({ id: schema.players.id, name: schema.players.name, pin: schema.players.pin })
      .from(schema.players)
      .where(and(eq(schema.players.id, identity.id), eq(schema.players.status, "active")))
      .limit(1)
  )[0];
  return player ? { kind: "player", ...player } : null;
}

/** ¿La fecha de nacimiento informada corresponde a esta cuenta? */
async function birthDateMatches(
  db: Db,
  account: PortalAccount,
  birthDate: string,
): Promise<boolean> {
  const rows =
    account.kind === "player"
      ? await db
          .select({ birthDate: schema.players.birthDate })
          .from(schema.players)
          .where(eq(schema.players.id, account.id))
      : await db
          .select({ birthDate: schema.players.birthDate })
          .from(schema.players)
          .where(
            and(eq(schema.players.guardianId, account.id), eq(schema.players.status, "active")),
          );

  return rows.some((row) => row.birthDate === birthDate);
}

async function savePin(db: Db, account: PortalAccount, pin: string) {
  const hashed = await hashSecret(pin);
  if (account.kind === "guardian") {
    await db.update(schema.guardians).set({ pin: hashed }).where(eq(schema.guardians.id, account.id));
  } else {
    await db.update(schema.players).set({ pin: hashed }).where(eq(schema.players.id, account.id));
  }
  return { success: true as const };
}

async function assertNotRateLimited(db: Db, key: string): Promise<void> {
  const limit = await checkRateLimit(db, key, PIN_LIMIT);
  if (!limit.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Demasiados intentos. Probá de nuevo en ${Math.ceil(limit.retryAfterSeconds / 60)} minutos.`,
    });
  }
}

function toPayer(identity: PortalIdentity): Payer {
  return { kind: identity.kind, id: identity.id };
}
