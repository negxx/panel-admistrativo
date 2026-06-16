import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const portalRouter = createRouter({
  getGuardianByDni: publicQuery.input(z.object({ dni: z.string() })).query(async ({ input }) => {
    const db = getDb();
    
    // Primero buscar como tutor
    const guardian = await db.select({
      id: schema.guardians.id,
      name: schema.guardians.name,
      dni: schema.guardians.dni,
      phone: schema.guardians.phone,
      hasPin: schema.guardians.pin,
      type: sql<string>`'guardian'`,
    }).from(schema.guardians)
      .where(eq(schema.guardians.dni, input.dni))
      .limit(1);

    if (guardian[0]) {
      return {
        ...guardian[0],
        hasPin: !!guardian[0].hasPin,
        isPlayer: false,
      };
    }

    // Si no es tutor, buscar como jugador sin tutor
    const player = await db.select({
      id: schema.players.id,
      name: schema.players.name,
      dni: schema.players.dni,
      phone: schema.players.phone,
      hasPin: schema.players.pin,
      type: sql<string>`'player'`,
    }).from(schema.players)
      .where(and(
        eq(schema.players.dni, input.dni),
        sql`${schema.players.guardianId} IS NULL OR ${schema.players.guardianId} = 0 OR ${schema.players.guardianId} = ''`
      ))
      .limit(1);

    if (!player[0]) return null;

    return {
      id: player[0].id,
      name: player[0].name,
      dni: player[0].dni,
      phone: player[0].phone,
      hasPin: !!player[0].hasPin,
      isPlayer: true,
    };
  }),

  verifyPin: publicQuery.input(z.object({
    dni: z.string(),
    pin: z.string(),
  })).mutation(async ({ input }) => {
    const db = getDb();
    
    // Primero buscar como tutor
    const guardian = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.dni, input.dni))
      .limit(1);

    if (guardian[0]) {
      if (!guardian[0].pin) return { success: false, message: "PIN no configurado" };
      if (guardian[0].pin !== input.pin) return { success: false, message: "PIN incorrecto" };
      return { success: true, guardianId: guardian[0].id, name: guardian[0].name, isPlayer: false };
    }

    // Buscar como jugador sin tutor
    const player = await db.select().from(schema.players)
      .where(and(
        eq(schema.players.dni, input.dni),
        sql`${schema.players.guardianId} IS NULL OR ${schema.players.guardianId} = 0 OR ${schema.players.guardianId} = ''`
      ))
      .limit(1);

    if (!player[0]) return { success: false, message: "Socio no encontrado" };
    if (!player[0].pin) return { success: false, message: "PIN no configurado" };
    if (player[0].pin !== input.pin) return { success: false, message: "PIN incorrecto" };

    return { success: true, guardianId: player[0].id, name: player[0].name, isPlayer: true };
  }),

  setPin: publicQuery.input(z.object({
    dni: z.string(),
    pin: z.string().min(4).max(4),
  })).mutation(async ({ input }) => {
    const db = getDb();
    
    // Primero verificar si es tutor
    const guardian = await db.select().from(schema.guardians)
      .where(eq(schema.guardians.dni, input.dni))
      .limit(1);

    if (guardian[0]) {
      // Es tutor, guardar PIN en guardians
      await db.update(schema.guardians)
        .set({ pin: input.pin })
        .where(eq(schema.guardians.dni, input.dni));
      return { success: true };
    }

    // Si no es tutor, es jugador sin tutor
    const player = await db.select().from(schema.players)
      .where(and(
        eq(schema.players.dni, input.dni),
        sql`${schema.players.guardianId} IS NULL OR ${schema.players.guardianId} = 0 OR ${schema.players.guardianId} = ''`
      ))
      .limit(1);

    if (player[0]) {
      await db.update(schema.players)
        .set({ pin: input.pin })
        .where(eq(schema.players.dni, input.dni));
      return { success: true };
    }

    return { success: false, message: "Socio no encontrado" };
  }),

  getMyChildren: publicQuery.input(z.object({ guardianId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const children = await db.select().from(schema.players)
      .where(and(eq(schema.players.guardianId, input.guardianId), eq(schema.players.status, "active")))
      .orderBy(schema.players.name);

    const childrenWithQuotas = await Promise.all(children.map(async (child) => {
      const quotas = await db.select().from(schema.quotas)
        .where(eq(schema.quotas.playerId, child.id))
        .orderBy(sql`${schema.quotas.year} DESC, ${schema.quotas.month} DESC`);

      const pendingQuotas = quotas.filter(q => q.status === "pending" || q.status === "overdue");
      return {
        ...child,
        allQuotas: quotas,
        pendingQuotas: pendingQuotas.slice(0, 6),
        totalPending: pendingQuotas.reduce((s, q) => s + q.totalAmount, 0),
      };
    }));

    return childrenWithQuotas;
  }),

  getMyQuotas: publicQuery.input(z.object({ playerId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    
    const player = await db.select().from(schema.players)
      .where(eq(schema.players.id, input.playerId))
      .limit(1);

    const quotas = await db.select({
      id: schema.quotas.id,
      playerId: schema.quotas.playerId,
      playerName: sql<string>`COALESCE(${player[0]?.name}, 'Socio')`,
      month: schema.quotas.month,
      year: schema.quotas.year,
      baseAmount: schema.quotas.baseAmount,
      discountAmount: schema.quotas.discountAmount,
      interestAmount: schema.quotas.interestAmount,
      totalAmount: schema.quotas.totalAmount,
      dueDate: schema.quotas.dueDate,
      status: schema.quotas.status,
    }).from(schema.quotas)
      .where(eq(schema.quotas.playerId, input.playerId))
      .orderBy(sql`${schema.quotas.year} DESC, ${schema.quotas.month} DESC`);

    const pendingQuotas = quotas.filter(q => q.status === "pending" || q.status === "overdue");

    return {
      player: player[0],
      allQuotas: quotas,
      pendingQuotas: pendingQuotas.slice(0, 6),
      totalPending: pendingQuotas.reduce((s, q) => s + q.totalAmount, 0),
    };
  }),

  getPendingQuotas: publicQuery.input(z.object({ guardianId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const result = await db.select({
      id: schema.quotas.id,
      playerId: schema.quotas.playerId,
      playerName: schema.players.name,
      month: schema.quotas.month,
      year: schema.quotas.year,
      baseAmount: schema.quotas.baseAmount,
      discountAmount: schema.quotas.discountAmount,
      interestAmount: schema.quotas.interestAmount,
      totalAmount: schema.quotas.totalAmount,
      dueDate: schema.quotas.dueDate,
      status: schema.quotas.status,
    }).from(schema.quotas)
      .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
      .where(and(
        eq(schema.players.guardianId, input.guardianId),
        sql`${schema.quotas.status} IN ('pending', 'overdue')`
      ))
      .orderBy(schema.players.name, schema.quotas.year, schema.quotas.month);

    return result;
  }),

  getPaymentHistory: publicQuery.input(z.object({ guardianId: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const payments = await db.select({
      id: schema.payments.id,
      totalAmount: schema.payments.totalAmount,
      paymentDate: schema.payments.paymentDate,
      paymentMethod: schema.payments.paymentMethod,
      receiptNumber: schema.payments.receiptNumber,
    }).from(schema.payments)
      .where(eq(schema.payments.guardianId, input.guardianId))
      .orderBy(sql`${schema.payments.paymentDate} DESC`)
      .limit(20);

    const paymentsWithDetails = await Promise.all(payments.map(async (p) => {
      const quotas = await db.select({
        playerName: schema.players.name,
        month: schema.quotas.month,
        year: schema.quotas.year,
      }).from(schema.paymentQuotas)
        .leftJoin(schema.quotas, eq(schema.paymentQuotas.quotaId, schema.quotas.id))
        .leftJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
        .where(eq(schema.paymentQuotas.paymentId, p.id));
      return { ...p, quotas };
    }));

    return paymentsWithDetails;
  }),

  payQuotas: publicQuery.input(z.object({
    guardianId: z.number(),
    quotaIds: z.array(z.number()),
    paymentMethod: z.enum(["transfer", "mercadopago"]),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { guardianId, quotaIds, paymentMethod } = input;

    const quotasToPay = await db.select().from(schema.quotas)
      .where(sql`${schema.quotas.id} IN (${quotaIds.join(",")})`);

    const totalAmount = quotasToPay.reduce((s, q) => s + q.totalAmount, 0);
    const today = new Date().toISOString().split("T")[0];

    const receiptCount = await db.select({ count: sql<number>`count(*)` }).from(schema.payments)
      .where(sql`strftime('%Y-%m', paymentdate) = strftime('%Y-%m', 'now')`);
    const receiptNumber = `R-${new Date().getFullYear()}-${String((receiptCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const paymentResult = await db.insert(schema.payments).values({
      guardianId,
      totalAmount,
      paymentDate: today,
      paymentMethod,
      receiptNumber,
    }).returning();

    const paymentId = paymentResult[0].id;

    for (const quotaId of quotaIds) {
      await db.insert(schema.paymentQuotas).values({ paymentId, quotaId });
      await db.update(schema.quotas)
        .set({ status: "paid", paymentDate: today, paymentMethod })
        .where(eq(schema.quotas.id, quotaId));
    }

    // Actualizar cierre de caja del día
    try {
      const closure = await db.select().from(schema.dailyClosures)
        .where(and(
          eq(schema.dailyClosures.date, today),
          eq(schema.dailyClosures.status, "open")
        ))
        .limit(1);

      if (closure[0]) {
        if (paymentMethod === "transfer") {
          await db.update(schema.dailyClosures)
            .set({ transferSales: (closure[0].transferSales || 0) + totalAmount })
            .where(eq(schema.dailyClosures.id, closure[0].id));
        } else if (paymentMethod === "mercadopago") {
          await db.update(schema.dailyClosures)
            .set({ mpSales: (closure[0].mpSales || 0) + totalAmount })
            .where(eq(schema.dailyClosures.id, closure[0].id));
        }
        await db.update(schema.dailyClosures)
          .set({ totalIncome: (closure[0].totalIncome || 0) + totalAmount })
          .where(eq(schema.dailyClosures.id, closure[0].id));
      }
    } catch (e) {
      // Silenciar error
    }

    return { payment: paymentResult[0] };
  }),

  payPlayerQuotas: publicQuery.input(z.object({
    playerId: z.number(),
    quotaIds: z.array(z.number()),
    paymentMethod: z.enum(["transfer", "mercadopago"]),
  })).mutation(async ({ input }) => {
    const db = getDb();
    const { playerId, quotaIds, paymentMethod } = input;

    const quotasToPay = await db.select().from(schema.quotas)
      .where(sql`${schema.quotas.id} IN (${quotaIds.join(",")})`);

    const totalAmount = quotasToPay.reduce((s, q) => s + q.totalAmount, 0);
    const today = new Date().toISOString().split("T")[0];

    const receiptCount = await db.select({ count: sql<number>`count(*)` }).from(schema.payments)
      .where(sql`strftime('%Y-%m', paymentdate) = strftime('%Y-%m', 'now')`);
    const receiptNumber = `R-${new Date().getFullYear()}-${String((receiptCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const paymentResult = await db.insert(schema.payments).values({
      playerId,  
      totalAmount,
      paymentDate: today,
      paymentMethod,
      receiptNumber,
    }).returning();

    const paymentId = paymentResult[0].id;

    for (const quotaId of quotaIds) {
      await db.insert(schema.paymentQuotas).values({ paymentId, quotaId });
      await db.update(schema.quotas)
        .set({ status: "paid", paymentDate: today, paymentMethod })
        .where(eq(schema.quotas.id, quotaId));
    }

    // Actualizar cierre de caja del día
    try {
      const closure = await db.select().from(schema.dailyClosures)
        .where(and(
          eq(schema.dailyClosures.date, today),
          eq(schema.dailyClosures.status, "open")
        ))
        .limit(1);

      if (closure[0]) {
        if (paymentMethod === "transfer") {
          await db.update(schema.dailyClosures)
            .set({ transferSales: (closure[0].transferSales || 0) + totalAmount })
            .where(eq(schema.dailyClosures.id, closure[0].id));
        } else if (paymentMethod === "mercadopago") {
          await db.update(schema.dailyClosures)
            .set({ mpSales: (closure[0].mpSales || 0) + totalAmount })
            .where(eq(schema.dailyClosures.id, closure[0].id));
        }
        await db.update(schema.dailyClosures)
          .set({ totalIncome: (closure[0].totalIncome || 0) + totalAmount })
          .where(eq(schema.dailyClosures.id, closure[0].id));
      }
    } catch (e) {
      // Silenciar error
    }

    return { payment: paymentResult[0] };
  }),
});