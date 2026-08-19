import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { buildDate, currentMonth, currentYear, isValidDate, today } from "../lib/dates";
import { calculateSiblingDiscount, quotaTotal, syncOverdueQuotas } from "../domain/quotas";
import { getSettings } from "../domain/settings";

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

export const playerRouter = createRouter({
  list: staffProcedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        category: z.string().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        guardianId: z.number().int().positive().optional(),
        /** Sólo socios con deuda. Útil para la gestión de cobranzas. */
        onlyDebtors: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      await syncOverdueQuotas(db);

      const { search, category, status, guardianId, onlyDebtors, page, pageSize } = input;

      const conditions = [];
      if (search) {
        // Busca por nombre o por DNI con el mismo campo. `ILIKE` ignora mayúsculas.
        conditions.push(
          sql`(${schema.players.name} ILIKE ${`%${search}%`} OR ${schema.players.dni} LIKE ${`%${search}%`})`,
        );
      }
      if (category) conditions.push(eq(schema.players.category, category));
      if (status) conditions.push(eq(schema.players.status, status));
      if (guardianId) conditions.push(eq(schema.players.guardianId, guardianId));
      if (onlyDebtors) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM quotas q WHERE q."playerId" = players.id AND q.status IN ('pending','overdue'))`,
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = Number(
        (await db.select({ count: count() }).from(schema.players).where(where))[0]?.count ?? 0,
      );

      /**
       * La deuda de cada socio se calcula con subconsultas dentro del mismo
       * SELECT. Antes se hacía una consulta extra por cada fila de la página
       * (N+1) y encima sólo traía la última cuota, que no dice nada de la deuda.
       */
      const players = await db
        .select({
          id: schema.players.id,
          name: schema.players.name,
          dni: schema.players.dni,
          birthDate: schema.players.birthDate,
          category: schema.players.category,
          quotaType: schema.players.quotaType,
          phone: schema.players.phone,
          email: schema.players.email,
          status: schema.players.status,
          guardianId: schema.players.guardianId,
          guardianName: schema.guardians.name,
          pendingCount: sql<number>`(
            SELECT COUNT(*) FROM quotas q
            WHERE q."playerId" = players.id AND q.status IN ('pending','overdue')
          )::integer`,
          overdueCount: sql<number>`(
            SELECT COUNT(*) FROM quotas q
            WHERE q."playerId" = players.id AND q.status = 'overdue'
          )::integer`,
          debtAmount: sql<number>`(
            SELECT COALESCE(SUM(q."totalAmount"), 0) FROM quotas q
            WHERE q."playerId" = players.id AND q.status IN ('pending','overdue')
          )::integer`,
        })
        .from(schema.players)
        .leftJoin(schema.guardians, eq(schema.players.guardianId, schema.guardians.id))
        .where(where)
        .orderBy(schema.players.name)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        players: players.map((p) => ({
          ...p,
          pendingCount: Number(p.pendingCount),
          overdueCount: Number(p.overdueCount),
          debtAmount: Number(p.debtAmount),
          /** Semáforo para la tabla. */
          debtStatus:
            Number(p.overdueCount) > 0
              ? ("overdue" as const)
              : Number(p.pendingCount) > 0
                ? ("pending" as const)
                : ("ok" as const),
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
      await syncOverdueQuotas(db);

      const player = (
        await db.select().from(schema.players).where(eq(schema.players.id, input.id)).limit(1)
      )[0];

      if (!player) return null;

      const guardian = player.guardianId
        ? ((
            await db
              .select()
              .from(schema.guardians)
              .where(eq(schema.guardians.id, player.guardianId))
              .limit(1)
          )[0] ?? null)
        : null;

      const quotas = await db
        .select()
        .from(schema.quotas)
        .where(eq(schema.quotas.playerId, input.id))
        .orderBy(desc(schema.quotas.year), desc(schema.quotas.month));

      const debtAmount = quotas
        .filter((q) => q.status !== "paid")
        .reduce((sum, q) => sum + q.totalAmount, 0);

      // El PIN nunca sale del backend, ni siquiera hasheado.
      const { pin: _pin, ...safePlayer } = player;
      return {
        ...safePlayer,
        hasPortalAccess: Boolean(player.pin),
        guardian: guardian
          ? { ...guardian, pin: undefined, hasPortalAccess: Boolean(guardian.pin) }
          : null,
        quotas,
        debtAmount,
      };
    }),

  create: staffProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
        dni: dniSchema,
        birthDate: z.string().refine(isValidDate, "Fecha de nacimiento inválida"),
        address: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
        email: emailSchema,
        category: z.string().trim().min(1, "Elegí una categoría"),
        quotaType: z.enum(["deportivo", "hermanos", "individual"]).optional(),
        guardianId: z.number().int().positive().nullable().optional(),
        notes: z.string().trim().max(500).optional(),
        /** Si está en `false`, no se le genera la cuota del mes en curso. */
        generateCurrentQuota: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      return db.transaction(async (tx) => {
        const duplicate = (
          await tx
            .select({ id: schema.players.id })
            .from(schema.players)
            .where(eq(schema.players.dni, input.dni))
            .limit(1)
        )[0];

        if (duplicate) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe un socio con ese DNI" });
        }

        const category = (
          await tx
            .select()
            .from(schema.categories)
            .where(eq(schema.categories.name, input.category))
            .limit(1)
        )[0];

        if (!category) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `La categoría "${input.category}" no está cargada. Creala primero en Categorías.`,
          });
        }

        const { generateCurrentQuota, ...playerData } = input;

        const player = (
          await tx
            .insert(schema.players)
            .values({
              ...playerData,
              guardianId: playerData.guardianId ?? null,
              status: "active",
              registrationDate: today(),
            })
            .returning()
        )[0];

        /**
         * Cuota del mes en curso.
         *
         * El monto sale de `categories`, igual que en la generación mensual.
         * Antes cada camino leía una tabla distinta y el mismo socio podía tener
         * una cuota de alta por $650 y la del mes siguiente por $50.000.
         */
        if (generateCurrentQuota && category.paysQuota && category.baseAmount > 0) {
          const settings = await getSettings(tx);
          const siblingCount = player.guardianId
            ? Number(
                (
                  await tx
                    .select({ count: count() })
                    .from(schema.players)
                    .where(
                      and(
                        eq(schema.players.guardianId, player.guardianId),
                        eq(schema.players.status, "active"),
                      ),
                    )
                )[0]?.count ?? 1,
              )
            : 1;

          const discountAmount = calculateSiblingDiscount({
            baseAmount: category.baseAmount,
            siblingCount,
            categoryDiscountPercent: category.siblingDiscountPercent,
            fallbackPercent: settings.discountPercent,
            discountEnabled: settings.discountEnabled,
          });

          await tx.insert(schema.quotas).values({
            playerId: player.id,
            month: currentMonth(),
            year: currentYear(),
            baseAmount: category.baseAmount,
            discountAmount,
            interestAmount: 0,
            totalAmount: quotaTotal(category.baseAmount, discountAmount, 0),
            dueDate: buildDate(currentYear(), currentMonth(), settings.dueDay),
            status: "pending",
          });
        }

        return player;
      });
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(120).optional(),
        dni: dniSchema.optional(),
        birthDate: z.string().refine(isValidDate, "Fecha inválida").optional(),
        address: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
        email: emailSchema,
        category: z.string().trim().min(1).optional(),
        quotaType: z.enum(["deportivo", "hermanos", "individual"]).optional(),
        guardianId: z.number().int().positive().nullable().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      if (data.dni) {
        const duplicate = (
          await db
            .select({ id: schema.players.id })
            .from(schema.players)
            .where(and(eq(schema.players.dni, data.dni), sql`${schema.players.id} <> ${id}`))
            .limit(1)
        )[0];
        if (duplicate) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe otro socio con ese DNI" });
        }
      }

      if (data.category) {
        const exists = (
          await db
            .select({ id: schema.categories.id })
            .from(schema.categories)
            .where(eq(schema.categories.name, data.category))
            .limit(1)
        )[0];
        if (!exists) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esa categoría no existe" });
        }
      }

      await db.update(schema.players).set(data).where(eq(schema.players.id, id));
      return { success: true };
    }),

  /**
   * Baja de un socio. Es lógica: pasa a `inactive` y deja de generar cuotas,
   * pero se conserva todo el historial de pagos.
   */
  delete: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const debt = Number(
        (
          await db
            .select({ count: count() })
            .from(schema.quotas)
            .where(
              and(
                eq(schema.quotas.playerId, input.id),
                sql`${schema.quotas.status} IN ('pending','overdue')`,
              ),
            )
        )[0]?.count ?? 0,
      );

      await db
        .update(schema.players)
        .set({ status: "inactive" })
        .where(eq(schema.players.id, input.id));

      return { success: true, pendingQuotas: debt };
    }),

  /** Reactiva un socio dado de baja. */
  reactivate: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(schema.players)
        .set({ status: "active" })
        .where(eq(schema.players.id, input.id));
      return { success: true };
    }),

  /**
   * Blanquea el PIN del portal de un socio sin tutor.
   * Lo usa la secretaría cuando la familia se lo olvida.
   */
  resetPortalPin: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().update(schema.players).set({ pin: null }).where(eq(schema.players.id, input.id));
      return { success: true };
    }),

  /** Nombres de categoría en uso. Sirve para detectar datos viejos sin categoría cargada. */
  usedCategories: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ category: schema.players.category })
      .from(schema.players)
      .orderBy(schema.players.category);
    return rows.map((r) => r.category);
  }),
});
