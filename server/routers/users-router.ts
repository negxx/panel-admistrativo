import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, adminProcedure } from "../middleware";
import { getDb, type DbClient } from "../queries/connection";
import { hashSecret } from "../lib/crypto";

/**
 * Usuarios del panel. Sólo un `admin` puede administrarlos.
 *
 * Reglas para no quedarse afuera del sistema:
 *  - Nadie puede borrarse a sí mismo.
 *  - No se puede borrar (ni degradar) al último admin.
 *  - Las contraseñas se guardan hasheadas.
 */
export const usersRouter = createRouter({
  list: adminProcedure.query(async () => {
    const db = getDb();
    // El hash de la contraseña nunca sale del backend.
    return db
      .select({
        id: schema.localUsers.id,
        username: schema.localUsers.username,
        name: schema.localUsers.name,
        role: schema.localUsers.role,
        createdAt: schema.localUsers.createdAt,
      })
      .from(schema.localUsers)
      .orderBy(schema.localUsers.name);
  }),

  create: adminProcedure
    .input(
      z.object({
        username: z
          .string()
          .trim()
          .min(3, "El usuario necesita al menos 3 caracteres")
          .max(40)
          .regex(/^[a-zA-Z0-9._-]+$/, "Sólo letras, números, punto, guion y guion bajo"),
        password: z.string().min(6, "La contraseña necesita al menos 6 caracteres"),
        name: z.string().trim().min(1, "Poné un nombre").max(80),
        role: z.enum(["admin", "secretary"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const duplicate = (
        await db
          .select({ id: schema.localUsers.id })
          .from(schema.localUsers)
          .where(eq(schema.localUsers.username, input.username))
          .limit(1)
      )[0];

      if (duplicate) {
        // Antes cualquier error de base se reportaba como "Username ya existe",
        // aunque el problema fuera otro.
        throw new TRPCError({ code: "CONFLICT", message: "Ese nombre de usuario ya existe" });
      }

      await db
        .insert(schema.localUsers)
        .values({ ...input, password: await hashSecret(input.password) });

      return { success: true };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        username: z.string().trim().min(3).max(40),
        name: z.string().trim().min(1).max(80),
        role: z.enum(["admin", "secretary"]),
        /** Vacío = no se cambia la contraseña. */
        password: z.string().min(6).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, password, ...rest } = input;

      const current = (
        await db.select().from(schema.localUsers).where(eq(schema.localUsers.id, id)).limit(1)
      )[0];

      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "El usuario no existe" });

      const duplicate = (
        await db
          .select({ id: schema.localUsers.id })
          .from(schema.localUsers)
          .where(
            and(eq(schema.localUsers.username, rest.username), sql`${schema.localUsers.id} <> ${id}`),
          )
          .limit(1)
      )[0];

      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Ese nombre de usuario ya existe" });
      }

      // Degradar al último admin dejaría el sistema sin quien administre.
      if (current.role === "admin" && rest.role !== "admin" && (await countAdmins(db)) <= 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tiene que quedar al menos un administrador",
        });
      }

      await db
        .update(schema.localUsers)
        .set(password ? { ...rest, password: await hashSecret(password) } : rest)
        .where(eq(schema.localUsers.id, id));

      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      if (ctx.user.source === "local" && ctx.user.id === input.id) {
        throw new TRPCError({ code: "CONFLICT", message: "No podés borrar tu propio usuario" });
      }

      const target = (
        await db.select().from(schema.localUsers).where(eq(schema.localUsers.id, input.id)).limit(1)
      )[0];

      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "El usuario no existe" });

      if (target.role === "admin" && (await countAdmins(db)) <= 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Es el único administrador: no se puede borrar",
        });
      }

      await db.delete(schema.localUsers).where(eq(schema.localUsers.id, input.id));
      return { success: true };
    }),
});

async function countAdmins(db: DbClient): Promise<number> {
  const row = (
    await db
      .select({ count: count() })
      .from(schema.localUsers)
      .where(eq(schema.localUsers.role, "admin"))
  )[0];
  return Number(row?.count ?? 0);
}
