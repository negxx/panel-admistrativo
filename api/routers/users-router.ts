import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const usersRouter = createRouter({
  list: adminQuery.query(async () => {
    const db = getDb();
    return db.select({
      id: schema.localUsers.id,
      username: schema.localUsers.username,
      name: schema.localUsers.name,
      role: schema.localUsers.role,
      createdAt: schema.localUsers.createdAt,
    }).from(schema.localUsers);
  }),

  create: adminQuery.input(
    z.object({
      username: z.string().min(3),
      password: z.string().min(4),
      name: z.string().min(1),
      role: z.enum(["admin", "secretary"]),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    try {
      await db.insert(schema.localUsers).values(input);
      return { success: true };
    } catch (error) {
      throw new Error("Username ya existe");
    }
  }),

  update: adminQuery.input(
    z.object({
      id: z.number(),
      username: z.string().min(3),
      name: z.string().min(1),
      role: z.enum(["admin", "secretary"]),
      password: z.string().optional(),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    const { id, password, ...rest } = input;
    
    if (password) {
      await db.update(schema.localUsers)
        .set({ ...rest, password })
        .where(eq(schema.localUsers.id, id));
    } else {
      await db.update(schema.localUsers)
        .set(rest)
        .where(eq(schema.localUsers.id, id));
    }
    return { success: true };
  }),

  delete: adminQuery.input(
    z.object({ id: z.number() })
  ).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(schema.localUsers)
      .where(eq(schema.localUsers.id, input.id));
    return { success: true };
  }),
});