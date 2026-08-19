import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { syncOverdueQuotas } from "../domain/quotas";

const dniSchema = z
  .string()
  .trim()
  .min(6, "El DNI es muy corto")
  .max(15)
  .regex(/^[0-9.]+$/, "El DNI sólo lleva números")
  .transform((value) => value.replace(/\./g, ""));

const emailSchema = z
  .string()
  .trim()
  .email("Email inválido")
  .or(z.literal(""))
  .optional()
  .transform((value) => (value ? value : undefined));

export const guardianRouter = createRouter({
  list: staffProcedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        onlyDebtors: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const conditions = [];
      if (input.search) {
        conditions.push(
          sql`(${schema.guardians.name} ILIKE ${`%${input.search}%`} OR ${schema.guardians.dni} LIKE ${`%${input.search}%`})`,
        );
      }
      if (input.onlyDebtors) {
        // Las columnas de la tabla externa se escriben calificadas a mano:
        // Drizzle las interpola sin prefijo y, dentro de una subconsulta que
        // ya tiene `players`, un `"id"` suelto es ambiguo.
        conditions.push(sql`(
          SELECT COALESCE(SUM(q."totalAmount"), 0)
          FROM quotas q
          JOIN players p ON p.id = q."playerId"
          WHERE p."guardianId" = guardians.id AND q.status IN ('pending','overdue')
        ) > 0`);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = Number(
        (await db.select({ count: count() }).from(schema.guardians).where(where))[0]?.count ?? 0,
      );

      // Cantidad de hijos y deuda familiar resueltas con subconsultas, en vez de
      // una consulta extra por cada tutor de la página (N+1).
      const guardians = await db
        .select({
          id: schema.guardians.id,
          name: schema.guardians.name,
          dni: schema.guardians.dni,
          phone: schema.guardians.phone,
          email: schema.guardians.email,
          address: schema.guardians.address,
          whatsappEnabled: schema.guardians.whatsappEnabled,
          hasPortalAccess: sql<boolean>`(${schema.guardians.pin} IS NOT NULL)`,
          playerCount: sql<number>`(
            SELECT COUNT(*) FROM players p
            WHERE p."guardianId" = guardians.id AND p.status = 'active'
          )::integer`,
          debtAmount: sql<number>`(
            SELECT COALESCE(SUM(q."totalAmount"), 0) FROM quotas q
            JOIN players p ON p.id = q."playerId"
            WHERE p."guardianId" = guardians.id AND q.status IN ('pending','overdue')
          )::integer`,
        })
        .from(schema.guardians)
        .where(where)
        .orderBy(schema.guardians.name)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        guardians: guardians.map((g) => ({
          ...g,
          hasPortalAccess: Boolean(g.hasPortalAccess),
          playerCount: Number(g.playerCount),
          debtAmount: Number(g.debtAmount),
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const guardian = (
        await db.select().from(schema.guardians).where(eq(schema.guardians.id, input.id)).limit(1)
      )[0];

      if (!guardian) return null;

      const children = await db
        .select()
        .from(schema.players)
        .where(eq(schema.players.guardianId, input.id))
        .orderBy(schema.players.name);

      const quotaRows = await db
        .select()
        .from(schema.quotas)
        .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(eq(schema.players.guardianId, input.id))
        .orderBy(desc(schema.quotas.year), desc(schema.quotas.month));
      const quotas = quotaRows.map((row) => row.quotas);

      const payments = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.guardianId, input.id))
        .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.id));

      const { pin: _pin, ...safeGuardian } = guardian;

      return {
        ...safeGuardian,
        hasPortalAccess: Boolean(guardian.pin),
        children: children.map(({ pin: childPin, ...child }) => ({
          ...child,
          hasPortalAccess: Boolean(childPin),
          quotas: quotas.filter((q) => q.playerId === child.id),
        })),
        payments,
        debtAmount: quotas
          .filter((q) => q.status !== "paid")
          .reduce((sum, q) => sum + q.totalAmount, 0),
      };
    }),

  create: staffProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
        dni: dniSchema,
        phone: z.string().trim().min(1, "El teléfono es obligatorio").max(40),
        email: emailSchema,
        address: z.string().trim().max(200).optional(),
        whatsappEnabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const duplicate = (
        await db
          .select({ id: schema.guardians.id })
          .from(schema.guardians)
          .where(eq(schema.guardians.dni, input.dni))
          .limit(1)
      )[0];

      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un tutor con ese DNI" });
      }

      // El PIN del portal no se carga desde acá: lo elige la familia al activar
      // su acceso. Ver `portal.activate`.
      return (await db.insert(schema.guardians).values(input).returning())[0];
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(120).optional(),
        dni: dniSchema.optional(),
        phone: z.string().trim().min(1).max(40).optional(),
        email: emailSchema,
        address: z.string().trim().max(200).optional(),
        whatsappEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      if (data.dni) {
        const duplicate = (
          await db
            .select({ id: schema.guardians.id })
            .from(schema.guardians)
            .where(and(eq(schema.guardians.dni, data.dni), sql`${schema.guardians.id} <> ${id}`))
            .limit(1)
        )[0];
        if (duplicate) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe otro tutor con ese DNI" });
        }
      }

      await db.update(schema.guardians).set(data).where(eq(schema.guardians.id, id));
      return { success: true };
    }),

  /**
   * Baja de un tutor.
   *
   * Antes borraba la fila sin mirar nada: los socios quedaban apuntando a un
   * tutor inexistente y los pagos históricos, huérfanos. Ahora se bloquea si
   * todavía tiene socios asociados o pagos registrados.
   */
  delete: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const children = Number(
        (
          await db
            .select({ count: count() })
            .from(schema.players)
            .where(eq(schema.players.guardianId, input.id))
        )[0]?.count ?? 0,
      );

      if (children > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `No se puede borrar: tiene ${children} socio(s) asociado(s). Reasignalos primero.`,
        });
      }

      const payments = Number(
        (
          await db
            .select({ count: count() })
            .from(schema.payments)
            .where(eq(schema.payments.guardianId, input.id))
        )[0]?.count ?? 0,
      );

      if (payments > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "No se puede borrar: tiene pagos registrados en el historial.",
        });
      }

      await db.delete(schema.guardians).where(eq(schema.guardians.id, input.id));
      return { success: true };
    }),

  /** Blanquea el PIN del portal. La familia vuelve a activarlo con su fecha de nacimiento. */
  resetPortalPin: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(schema.guardians)
        .set({ pin: null })
        .where(eq(schema.guardians.id, input.id));
      return { success: true };
    }),

  /**
   * Búsqueda rápida por DNI para el mostrador. Acepta el DNI del tutor o el del
   * socio y devuelve siempre **a quién hay que facturarle**: si el socio tiene
   * tutor, la cuenta es la del tutor, porque ahí están todas las cuotas de la
   * familia.
   */
  searchByDni: staffProcedure.input(z.object({ dni: dniSchema })).query(async ({ input }) => {
    const db = getDb();
    await syncOverdueQuotas(db);

    const guardian = (
      await db
        .select({
          id: schema.guardians.id,
          name: schema.guardians.name,
          dni: schema.guardians.dni,
          phone: schema.guardians.phone,
        })
        .from(schema.guardians)
        .where(eq(schema.guardians.dni, input.dni))
        .limit(1)
    )[0];

    if (guardian) return { kind: "guardian" as const, ...guardian, matchedBy: "guardian" as const };

    const player = (
      await db
        .select({
          id: schema.players.id,
          name: schema.players.name,
          dni: schema.players.dni,
          phone: schema.players.phone,
          guardianId: schema.players.guardianId,
        })
        .from(schema.players)
        .where(eq(schema.players.dni, input.dni))
        .limit(1)
    )[0];

    if (!player) return null;

    if (player.guardianId) {
      const parent = (
        await db
          .select({
            id: schema.guardians.id,
            name: schema.guardians.name,
            dni: schema.guardians.dni,
            phone: schema.guardians.phone,
          })
          .from(schema.guardians)
          .where(eq(schema.guardians.id, player.guardianId))
          .limit(1)
      )[0];

      if (parent) {
        return { kind: "guardian" as const, ...parent, matchedBy: "player" as const };
      }
    }

    return {
      kind: "player" as const,
      id: player.id,
      name: player.name,
      dni: player.dni,
      phone: player.phone,
      matchedBy: "player" as const,
    };
  }),
});
