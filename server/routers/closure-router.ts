import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createRouter, adminProcedure, staffProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { isValidDate, today } from "../lib/dates";
import { calculateDayTotals, expectedCashFor, refreshClosure } from "../domain/cash";

const dateSchema = z.string().refine(isValidDate, "Fecha inválida (usá AAAA-MM-DD)");

/**
 * Cierre de caja diario.
 *
 * Cambios importantes respecto de la versión anterior:
 *
 *  - `openedBy` y `closedBy` salen de la sesión. Antes el frontend mandaba un
 *    `1` fijo, así que la trazabilidad de quién abrió y cerró la caja no servía.
 *  - Los totales ya no llegan desde el navegador: se recalculan desde los pagos
 *    y movimientos reales del día (`api/domain/cash.ts`).
 *  - El efectivo esperado descuenta los egresos pagados en efectivo. Antes no
 *    los restaba y cualquier gasto del día aparecía como faltante de caja.
 */
export const closureRouter = createRouter({
  list: staffProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(60) }).default({ limit: 60 }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select({
          id: schema.dailyClosures.id,
          date: schema.dailyClosures.date,
          status: schema.dailyClosures.status,
          openingAmount: schema.dailyClosures.openingAmount,
          cashSales: schema.dailyClosures.cashSales,
          transferSales: schema.dailyClosures.transferSales,
          mpSales: schema.dailyClosures.mpSales,
          otherIncome: schema.dailyClosures.otherIncome,
          totalIncome: schema.dailyClosures.totalIncome,
          totalExpenses: schema.dailyClosures.totalExpenses,
          cashExpenses: schema.dailyClosures.cashExpenses,
          expectedCash: schema.dailyClosures.expectedCash,
          actualCash: schema.dailyClosures.actualCash,
          difference: schema.dailyClosures.difference,
          notes: schema.dailyClosures.notes,
          closedAt: schema.dailyClosures.closedAt,
          openedByName: schema.localUsers.name,
        })
        .from(schema.dailyClosures)
        .leftJoin(schema.localUsers, eq(schema.dailyClosures.openedBy, schema.localUsers.id))
        .orderBy(desc(schema.dailyClosures.date))
        .limit(input.limit);
    }),

  /**
   * Estado de la caja de un día.
   *
   * Devuelve siempre los totales al momento, aunque todavía no se haya abierto
   * la caja: así la pantalla puede mostrar cuánto se cobró incluso si nadie
   * apretó "Abrir caja".
   */
  getByDate: staffProcedure.input(z.object({ date: dateSchema })).query(async ({ input }) => {
    const db = getDb();
    // Si el día tiene cierre, lo deja al día antes de leerlo.
    await refreshClosure(db, input.date);

    const closure =
      (
        await db
          .select()
          .from(schema.dailyClosures)
          .where(eq(schema.dailyClosures.date, input.date))
          .limit(1)
      )[0] ?? null;

    const totals = await calculateDayTotals(db, input.date);

    return {
      closure,
      totals,
      /** Lo que debería haber en el cajón según los movimientos del día. */
      expectedCash: expectedCashFor(closure?.openingAmount ?? 0, totals),
    };
  }),

  open: staffProcedure
    .input(
      z.object({
        date: dateSchema.optional(),
        openingAmount: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const date = input.date ?? today();

      return db.transaction(async (tx) => {
        const existing = (
          await tx
            .select()
            .from(schema.dailyClosures)
            .where(eq(schema.dailyClosures.date, date))
            .limit(1)
        )[0];

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              existing.status === "open"
                ? "La caja de ese día ya está abierta"
                : "La caja de ese día ya fue cerrada",
          });
        }

        const created = (
          await tx
            .insert(schema.dailyClosures)
            .values({
              date,
              openedBy: ctx.user.source === "local" ? ctx.user.id : null,
              openingAmount: input.openingAmount,
              status: "open",
            })
            .returning()
        )[0];

        // Deja los totales listos con lo que ya se haya cobrado ese día.
        await refreshClosure(tx, date);
        return created;
      });
    }),

  /**
   * Cierra la caja del día.
   *
   * Lo único que informa el operador es el efectivo contado y una observación:
   * todos los demás totales los calcula el servidor.
   */
  close: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        actualCash: z.number().int().min(0),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      return db.transaction(async (tx) => {
        const closure = (
          await tx
            .select()
            .from(schema.dailyClosures)
            .where(eq(schema.dailyClosures.id, input.id))
            .limit(1)
        )[0];

        if (!closure) throw new TRPCError({ code: "NOT_FOUND", message: "El cierre no existe" });
        if (closure.status === "closed") {
          throw new TRPCError({ code: "CONFLICT", message: "Esa caja ya está cerrada" });
        }

        const totals = await calculateDayTotals(tx, closure.date);
        const expectedCash = expectedCashFor(closure.openingAmount, totals);

        await tx
          .update(schema.dailyClosures)
          .set({
            cashSales: totals.cashSales,
            transferSales: totals.transferSales,
            mpSales: totals.mpSales,
            otherIncome: totals.otherIncome,
            totalIncome: totals.totalIncome,
            totalExpenses: totals.totalExpenses,
            cashExpenses: totals.cashExpenses,
            expectedCash,
            actualCash: input.actualCash,
            difference: input.actualCash - expectedCash,
            notes: input.notes,
            status: "closed",
            closedBy: ctx.user.source === "local" ? ctx.user.id : null,
            closedAt: new Date(),
          })
          .where(eq(schema.dailyClosures.id, input.id));

        return {
          success: true,
          expectedCash,
          difference: input.actualCash - expectedCash,
        };
      });
    }),

  /** Reabre una caja cerrada por error. Sólo admin, queda registrado en las notas. */
  reopen: adminProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().trim().max(300) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const closure = (
        await db
          .select()
          .from(schema.dailyClosures)
          .where(eq(schema.dailyClosures.id, input.id))
          .limit(1)
      )[0];

      if (!closure) throw new TRPCError({ code: "NOT_FOUND", message: "El cierre no existe" });

      await db
        .update(schema.dailyClosures)
        .set({
          status: "open",
          closedAt: null,
          closedBy: null,
          difference: 0,
          notes: `${closure.notes ? `${closure.notes}\n` : ""}[Reabierta por ${ctx.user.name}] ${input.reason}`,
        })
        .where(eq(schema.dailyClosures.id, input.id));

      return { success: true };
    }),

  /** Borra un cierre. Sólo admin: es un registro contable. */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().delete(schema.dailyClosures).where(eq(schema.dailyClosures.id, input.id));
      return { success: true };
    }),
});
