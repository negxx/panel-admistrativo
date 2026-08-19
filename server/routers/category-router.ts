import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, adminProcedure, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";

/**
 * Categorías: la única fuente de verdad de cuánto sale la cuota.
 *
 * Antes convivía con la tabla `quota_configs`, que tenía otros nombres de
 * categoría y otros montos. Al alta de un socio se leía una tabla y al generar
 * el mes, la otra: el mismo chico terminaba con cuotas de importes distintos.
 */
export const categoryRouter = createRouter({
  /**
   * Listado con la cantidad de socios activos de cada categoría.
   * Lo puede leer cualquier usuario del panel: se usa en los combos de filtros
   * y en el alta de socios.
   */
  list: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        paysQuota: schema.categories.paysQuota,
        baseAmount: schema.categories.baseAmount,
        siblingDiscountPercent: schema.categories.siblingDiscountPercent,
        description: schema.categories.description,
        // `categories.name` va calificado a mano: sin el prefijo, dentro de la
        // subconsulta `"name"` resolvía a `players.name` y el conteo daba
        // siempre cero, sin ningún error que lo delatara.
        playerCount: sql<number>`(
          SELECT COUNT(*) FROM players p
          WHERE p.category = categories.name AND p.status = 'active'
        )::integer`,
      })
      .from(schema.categories)
      .orderBy(schema.categories.name);

    return rows.map((c) => ({ ...c, playerCount: Number(c.playerCount) }));
  }),

  /**
   * Categorías que usan los socios pero no están cargadas en la tabla.
   *
   * Sirve de alerta en pantalla: a esos socios no se les puede generar la cuota
   * porque el sistema no sabe cuánto cobrarles. Antes se les aplicaba en
   * silencio un valor fijo de $50.000 escrito en el código.
   */
  missing: staffProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        category: schema.players.category,
        playerCount: count(),
      })
      .from(schema.players)
      .where(
        and(
          eq(schema.players.status, "active"),
          sql`${schema.players.category} NOT IN (SELECT name FROM categories)`,
        ),
      )
      .groupBy(schema.players.category);

    return rows.map((r) => ({ ...r, playerCount: Number(r.playerCount) }));
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Poné un nombre").max(60),
        paysQuota: z.boolean().default(true),
        baseAmount: z.number().int().min(0).default(0),
        siblingDiscountPercent: z.number().int().min(0).max(100).default(0),
        description: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const duplicate = (
        await db
          .select({ id: schema.categories.id })
          .from(schema.categories)
          .where(eq(schema.categories.name, input.name))
          .limit(1)
      )[0];

      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe una categoría con ese nombre" });
      }

      return (await db.insert(schema.categories).values(input).returning())[0];
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(60),
        paysQuota: z.boolean().default(true),
        baseAmount: z.number().int().min(0).default(0),
        siblingDiscountPercent: z.number().int().min(0).max(100).default(0),
        description: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      return db.transaction(async (tx) => {
        const current = (
          await tx.select().from(schema.categories).where(eq(schema.categories.id, id)).limit(1)
        )[0];

        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "La categoría no existe" });

        const duplicate = (
          await tx
            .select({ id: schema.categories.id })
            .from(schema.categories)
            .where(and(eq(schema.categories.name, data.name), sql`${schema.categories.id} <> ${id}`))
            .limit(1)
        )[0];

        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe otra categoría con ese nombre",
          });
        }

        await tx.update(schema.categories).set(data).where(eq(schema.categories.id, id));

        // Los socios referencian la categoría por nombre: si se renombra, hay
        // que arrastrarlos o quedan apuntando a una categoría inexistente.
        if (current.name !== data.name) {
          await tx
            .update(schema.players)
            .set({ category: data.name })
            .where(eq(schema.players.category, current.name));
        }

        return { success: true };
      });
    }),

  /**
   * Borra una categoría. Se bloquea si todavía tiene socios: si no, quedarían
   * sin monto de cuota y la generación mensual los saltearía en silencio.
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const category = (
        await db.select().from(schema.categories).where(eq(schema.categories.id, input.id)).limit(1)
      )[0];

      if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "La categoría no existe" });

      const players = Number(
        (
          await db
            .select({ count: count() })
            .from(schema.players)
            .where(eq(schema.players.category, category.name))
        )[0]?.count ?? 0,
      );

      if (players > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `No se puede borrar: hay ${players} socio(s) en esta categoría.`,
        });
      }

      await db.delete(schema.categories).where(eq(schema.categories.id, input.id));
      return { success: true };
    }),
});
