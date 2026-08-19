import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { createTestDb } from "../domain/test-db";
import { setDb } from "../queries/connection";
import { appRouter } from "../router";
import type { TrpcContext } from "../context";

/**
 * Recorre **todas** las consultas de lectura del panel contra un PostgreSQL real.
 *
 * Existe por un fallo concreto: `dashboard.getCollectionTrend` agrupaba por
 * `month` pero usaba también `year` en el SELECT. SQLite lo toleraba y Postgres
 * lo rechaza, así que el error apareció recién en producción — y como el
 * frontend agrupa las consultas del panel en una sola petición, esa falla dejaba
 * **toda** la pantalla vacía.
 *
 * Los tests anteriores cubrían las reglas de negocio (cobros, mora, caja) pero
 * ninguna de las consultas de listado, que son las que más SQL tienen. Éste
 * llama a cada endpoint como lo haría el navegador: si una consulta no es válida
 * en Postgres, falla acá y no en el club.
 */

const staff: TrpcContext = {
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  user: { id: 1, name: "Admin", role: "admin", source: "local" },
};

let caller: ReturnType<typeof appRouter.createCaller>;

beforeAll(async () => {
  const db = await createTestDb();
  setDb(db);

  // Un club en miniatura, pero con todas las formas que importan: una familia
  // con dos hermanos, un socio sin tutor, cuotas pagadas e impagas, y
  // movimientos de caja.
  await db.insert(schema.localUsers).values({
    username: "admin",
    password: "x",
    name: "Admin",
    role: "admin",
  });
  await db.insert(schema.settings).values([
    { key: "interestRate", value: "0.5" },
    { key: "graceDays", value: "3" },
  ]);
  await db.insert(schema.categories).values([
    { name: "2014", baseAmount: 45_000, siblingDiscountPercent: 10 },
    { name: "2012", baseAmount: 55_000 },
  ]);

  const [tutor] = await db
    .insert(schema.guardians)
    .values({ name: "Carlos Rodríguez", dni: "25123456", phone: "+5491100000000" })
    .returning();

  const players = await db
    .insert(schema.players)
    .values([
      { name: "Mateo", dni: "54123456", birthDate: "2014-03-15", category: "2014", guardianId: tutor.id },
      { name: "Lucas", dni: "53765432", birthDate: "2012-07-22", category: "2012", guardianId: tutor.id },
      { name: "Diego", dni: "33456789", birthDate: "1998-02-14", category: "2012" },
    ])
    .returning();

  const year = new Date().getFullYear();
  await db.insert(schema.quotas).values([
    { playerId: players[0].id, month: 1, year, baseAmount: 45_000, totalAmount: 45_000, dueDate: `${year}-01-10`, status: "paid" },
    { playerId: players[0].id, month: 2, year, baseAmount: 45_000, totalAmount: 45_000, dueDate: `${year}-02-10`, status: "overdue" },
    { playerId: players[1].id, month: 1, year, baseAmount: 55_000, totalAmount: 55_000, dueDate: `${year}-01-10`, status: "pending" },
    { playerId: players[2].id, month: 1, year, baseAmount: 55_000, totalAmount: 55_000, dueDate: `${year}-01-10`, status: "overdue" },
  ]);

  await db.insert(schema.payments).values({
    guardianId: tutor.id,
    totalAmount: 45_000,
    paymentDate: `${year}-01-05`,
    paymentMethod: "cash",
    status: "confirmed",
    receiptNumber: `R-${year}-0001`,
  });

  await db.insert(schema.transactions).values([
    { type: "income", category: "Buffet", description: "Venta", amount: 10_000, date: `${year}-01-05`, method: "cash" },
    { type: "expense", category: "Servicios", description: "Luz", amount: 5_000, date: `${year}-01-06`, method: "transfer" },
  ]);

  caller = appRouter.createCaller(staff);
});

describe("consultas del panel", () => {
  it("dashboard.getSummary", async () => {
    const r = await caller.dashboard.getSummary();
    expect(r.totalPlayers).toBe(3);
    expect(r.totalDebt).toBeGreaterThan(0);
  });

  it("dashboard.getCollectionTrend — el que fallaba en producción", async () => {
    const r = await caller.dashboard.getCollectionTrend();
    expect(r).toHaveLength(12);
    // Enero tiene una cuota cobrada de 45.000.
    expect(r[0].collected).toBe(45_000);
    expect(r[0].expected).toBeGreaterThan(0);
  });

  it("dashboard.getCategoryDistribution", async () => {
    const r = await caller.dashboard.getCategoryDistribution();
    expect(r.length).toBeGreaterThan(0);
  });

  it("dashboard.getRecentPayments", async () => {
    const r = await caller.dashboard.getRecentPayments();
    expect(r[0].payerName).toBe("Carlos Rodríguez");
  });

  it("dashboard.getUpcomingDues", async () => {
    await expect(caller.dashboard.getUpcomingDues()).resolves.toBeInstanceOf(Array);
  });

  it("player.list, con filtros y búsqueda", async () => {
    const todos = await caller.player.list({ page: 1, pageSize: 25 });
    expect(todos.total).toBe(3);

    const buscado = await caller.player.list({ search: "Mateo", page: 1, pageSize: 25 });
    expect(buscado.players[0].name).toBe("Mateo");

    const deudores = await caller.player.list({ onlyDebtors: true, page: 1, pageSize: 25 });
    expect(deudores.total).toBeGreaterThan(0);
  });

  it("player.getById", async () => {
    const lista = await caller.player.list({ page: 1, pageSize: 1 });
    const ficha = await caller.player.getById({ id: lista.players[0].id });
    expect(ficha?.quotas).toBeInstanceOf(Array);
  });

  it("guardian.list y guardian.getById", async () => {
    const lista = await caller.guardian.list({ page: 1, pageSize: 25 });
    expect(lista.total).toBe(1);
    expect(lista.guardians[0].playerCount).toBe(2);
    expect(lista.guardians[0].debtAmount).toBeGreaterThan(0);

    const ficha = await caller.guardian.getById({ id: lista.guardians[0].id });
    expect(ficha?.children).toHaveLength(2);
  });

  it("guardian.searchByDni", async () => {
    const r = await caller.guardian.searchByDni({ dni: "25123456" });
    expect(r?.kind).toBe("guardian");
  });

  it("quota.list y quota.summary", async () => {
    const year = new Date().getFullYear();
    const lista = await caller.quota.list({ year, page: 1, pageSize: 50 });
    expect(lista.total).toBe(4);

    const resumen = await caller.quota.summary({ year });
    expect(resumen.collected).toBeGreaterThan(0);
  });

  it("payment.list, pendingReview y pendingQuotasFor", async () => {
    await expect(caller.payment.list({ page: 1, pageSize: 25 })).resolves.toBeDefined();
    await expect(caller.payment.pendingReview()).resolves.toBeDefined();
    await expect(caller.payment.pendingReviewCount()).resolves.toBe(0);

    const tutores = await caller.guardian.list({ page: 1, pageSize: 1 });
    const pendientes = await caller.payment.pendingQuotasFor({
      payer: { kind: "guardian", id: tutores.guardians[0].id },
    });
    expect(pendientes.quotas.length).toBeGreaterThan(0);
  });

  it("transaction.list, getSummary y getMonthlyTrend", async () => {
    const lista = await caller.transaction.list({ page: 1, pageSize: 25 });
    expect(lista.total).toBe(2);

    const resumen = await caller.transaction.getSummary({});
    expect(resumen.totalIncome).toBe(10_000);
    expect(resumen.totalExpense).toBe(5_000);

    await expect(caller.transaction.getMonthlyTrend()).resolves.toBeInstanceOf(Array);
    await expect(caller.transaction.categories()).resolves.toContain("Buffet");
  });

  it("alert.getDebtors y alert.buildMessage", async () => {
    const deudores = await caller.alert.getDebtors({ minAmount: 0, onlyOverdue: true });
    expect(deudores.debtors.length).toBeGreaterThan(0);

    // Incluye a los socios sin tutor, que la versión anterior descartaba.
    expect(deudores.debtors.some((d) => d.kind === "player")).toBe(true);

    const mensaje = await caller.alert.buildMessage({
      kind: deudores.debtors[0].kind,
      id: deudores.debtors[0].id,
    });
    expect(mensaje?.message).toContain("cuotas pendientes");
  });

  it("alert.getLogs", async () => {
    await expect(caller.alert.getLogs({ limit: 10 })).resolves.toBeInstanceOf(Array);
  });

  it("category.list cuenta bien los socios de cada categoría", async () => {
    const lista = await caller.category.list();
    expect(lista.length).toBe(2);

    // Este conteo daba siempre 0: dentro de la subconsulta, `"name"` resolvía a
    // `players.name` en vez de `categories.name`, sin lanzar ningún error.
    expect(lista.find((c) => c.name === "2014")?.playerCount).toBe(1);
    expect(lista.find((c) => c.name === "2012")?.playerCount).toBe(2);

    await expect(caller.category.missing()).resolves.toBeInstanceOf(Array);
  });

  it("closure.list, getByDate y quota.availableYears", async () => {
    await expect(caller.closure.list({ limit: 10 })).resolves.toBeInstanceOf(Array);

    const hoy = await caller.closure.getByDate({ date: `${new Date().getFullYear()}-01-05` });
    expect(hoy.totals.cashSales).toBe(45_000);
    expect(hoy.totals.otherCashIncome).toBe(10_000);

    await expect(caller.quota.availableYears()).resolves.toBeInstanceOf(Array);
  });

  it("users.list y quota.getGlobalSettings", async () => {
    await expect(caller.users.list()).resolves.toHaveLength(1);
    const config = await caller.quota.getGlobalSettings();
    expect(config.interestRate).toBe(0.5);
  });
});
