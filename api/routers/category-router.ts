import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const categoryRouter = createRouter({
  list: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(schema.categories).orderBy(schema.categories.name);
  }),

  create: adminQuery.input(
    z.object({
      name: z.string().min(1),
      paysQuota: z.boolean().default(true),
      baseAmount: z.number().default(0),
      description: z.string().optional(),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    const result = await db.insert(schema.categories).values(input).returning();
    return result[0];
  }),

  update: adminQuery.input(
    z.object({
      id: z.number(),
      name: z.string().min(1),
      paysQuota: z.boolean().default(true),
      baseAmount: z.number().default(0),
      description: z.string().optional(),
    })
  ).mutation(async ({ input }) => {
    const db = getDb();
    const { id, ...data } = input;
    await db.update(schema.categories).set(data).where(eq(schema.categories.id, id));
    return { success: true };
  }),

  delete: adminQuery.input(
    z.object({ id: z.number() })
  ).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(schema.categories).where(eq(schema.categories.id, input.id));
    return { success: true };
  }),
});