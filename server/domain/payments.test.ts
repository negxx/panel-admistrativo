import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createTestDb, type TestDb } from "./test-db";
import {
  confirmPayment,
  loadPayableQuotas,
  registerPayment,
  rejectPayment,
  reportPortalPayment,
} from "./payments";
import { calculateDayTotals } from "./cash";
import { today } from "../lib/dates";

/**
 * Tests de integración del cobro, contra un Postgres real en memoria (PGlite).
 *
 * El primer bloque cubre **el bug más caro que tenía el sistema**: pagar más de
 * una cuota registraba el pago en $0 y marcaba las cuotas como pagadas igual.
 */

let db: TestDb;
let guardianId: number;
let playerAId: number;
let playerBId: number;
let quotaIds: number[];
let staffId: number;

const TODAY = today();

beforeEach(async () => {
  db = await createTestDb();

  staffId = (
    await db
      .insert(schema.localUsers)
      .values({ username: "admin", password: "x", name: "Admin", role: "admin" })
      .returning()
  )[0].id;

  guardianId = (
    await db
      .insert(schema.guardians)
      .values({ name: "Carlos Rodríguez", dni: "25123456", phone: "+5491100000000" })
      .returning()
  )[0].id;

  playerAId = (
    await db
      .insert(schema.players)
      .values({
        name: "Mateo",
        dni: "54123456",
        birthDate: "2014-03-15",
        category: "2014",
        guardianId,
      })
      .returning()
  )[0].id;

  playerBId = (
    await db
      .insert(schema.players)
      .values({
        name: "Lucas",
        dni: "53765432",
        birthDate: "2012-07-22",
        category: "2012",
        guardianId,
      })
      .returning()
  )[0].id;

  // Tres cuotas impagas: dos de un hermano y una del otro.
  const rows = await db
    .insert(schema.quotas)
    .values(
      [
        { playerId: playerAId, month: 1, amount: 45_000 },
        { playerId: playerAId, month: 2, amount: 45_000 },
        { playerId: playerBId, month: 1, amount: 55_000 },
      ].map((q) => ({
        playerId: q.playerId,
        month: q.month,
        year: 2026,
        baseAmount: q.amount,
        discountAmount: 0,
        interestAmount: 0,
        totalAmount: q.amount,
        dueDate: `2026-${String(q.month).padStart(2, "0")}-10`,
        status: "pending" as const,
      })),
    )
    .returning({ id: schema.quotas.id });

  quotaIds = rows.map((r) => r.id);
});

describe("registerPayment — importe con varias cuotas", () => {
  it("suma correctamente TODAS las cuotas seleccionadas", async () => {
    // Éste es el bug original: con `IN (${ids.join(",")})` Drizzle mandaba el
    // texto "1,2,3" como un único parámetro, no matcheaba ninguna fila y el
    // pago se guardaba en $0 aunque las cuotas quedaran pagadas.
    const payment = await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "cash",
      createdBy: staffId,
    });

    expect(payment.totalAmount).toBe(145_000);
  });

  it("funciona igual con una sola cuota", async () => {
    const payment = await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "cash",
      createdBy: staffId,
    });
    expect(payment.totalAmount).toBe(45_000);
  });

  it("marca como pagadas exactamente las cuotas cobradas", async () => {
    await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0], quotaIds[1]],
      paymentMethod: "cash",
      createdBy: staffId,
    });

    const quotas = await db.select().from(schema.quotas);
    expect(quotas.filter((q) => q.status === "paid")).toHaveLength(2);
    expect(quotas.find((q) => q.id === quotaIds[2])?.status).toBe("pending");
  });

  it("emite un número de recibo y lo copia a las cuotas", async () => {
    const payment = await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "cash",
      createdBy: staffId,
    });

    expect(payment.receiptNumber).toMatch(/^R-\d{4}-0001$/);
    const quota = (
      await db.select().from(schema.quotas).where(eq(schema.quotas.id, quotaIds[0]))
    )[0];
    expect(quota.receiptNumber).toBe(payment.receiptNumber);
  });
});

describe("numeración de recibos", () => {
  it("no repite números entre pagos consecutivos", async () => {
    const first = await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "cash",
      createdBy: staffId,
    });
    const second = await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[1]],
      paymentMethod: "cash",
      createdBy: staffId,
    });

    expect(first.receiptNumber).not.toBe(second.receiptNumber);
    expect(second.receiptNumber?.endsWith("0002")).toBe(true);
  });
});

describe("validación del pagador", () => {
  it("rechaza cobrar cuotas de otra familia", async () => {
    // Otra familia, con su propio socio: así el rechazo viene de la validación
    // de pertenencia y no de "esta cuenta no tiene socios".
    const otherGuardian = (
      await db
        .insert(schema.guardians)
        .values({ name: "Ajeno", dni: "99999999", phone: "+5491111111111" })
        .returning()
    )[0].id;

    await db.insert(schema.players).values({
      name: "Hijo ajeno",
      dni: "60000000",
      birthDate: "2013-01-01",
      category: "2013",
      guardianId: otherGuardian,
    });

    await expect(
      registerPayment(db, {
        payer: { kind: "guardian", id: otherGuardian },
        quotaIds,
        paymentMethod: "cash",
        createdBy: staffId,
      }),
    ).rejects.toThrow(/no pertenecen/i);
  });

  it("rechaza si la cuenta no tiene ningún socio asociado", async () => {
    const empty = (
      await db
        .insert(schema.guardians)
        .values({ name: "Sin hijos", dni: "88888888", phone: "+5491122222222" })
        .returning()
    )[0].id;

    await expect(
      registerPayment(db, {
        payer: { kind: "guardian", id: empty },
        quotaIds,
        paymentMethod: "cash",
        createdBy: staffId,
      }),
    ).rejects.toThrow(/no hay socios/i);
  });

  it("rechaza cobrar dos veces la misma cuota", async () => {
    await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "cash",
      createdBy: staffId,
    });

    await expect(
      registerPayment(db, {
        payer: { kind: "guardian", id: guardianId },
        quotaIds: [quotaIds[0]],
        paymentMethod: "cash",
        createdBy: staffId,
      }),
    ).rejects.toThrow(/ya figuran pagadas/i);
  });

  it("rechaza ids de cuota inexistentes", async () => {
    await expect(
      loadPayableQuotas(db, { kind: "guardian", id: guardianId }, [99_999]),
    ).rejects.toThrow(/ya no existe/i);
  });

  it("un socio sin tutor sólo puede pagar lo suyo", async () => {
    const solo = (
      await db
        .insert(schema.players)
        .values({ name: "Diego", dni: "33456789", birthDate: "1998-02-14", category: "2009" })
        .returning()
    )[0].id;

    await expect(
      registerPayment(db, {
        payer: { kind: "player", id: solo },
        quotaIds: [quotaIds[0]],
        paymentMethod: "cash",
        createdBy: staffId,
      }),
    ).rejects.toThrow(/no pertenecen/i);
  });
});

describe("pagos informados desde el portal", () => {
  it("NO salda las cuotas hasta que el club confirma", async () => {
    // Antes el portal marcaba la cuota como pagada apenas el socio apretaba el
    // botón: cualquiera podía dejar su cuenta al día sin pagar un peso.
    const payment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "transfer",
      reference: "OP-12345",
    });

    expect(payment.status).toBe("pending_review");
    expect(payment.receiptNumber).toBeNull();

    const quotas = await db.select().from(schema.quotas);
    expect(quotas.every((q) => q.status === "pending")).toBe(true);
  });

  it("no deja informar dos veces la misma cuota", async () => {
    await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "transfer",
    });

    await expect(
      reportPortalPayment(db, {
        payer: { kind: "guardian", id: guardianId },
        quotaIds: [quotaIds[0]],
        paymentMethod: "transfer",
      }),
    ).rejects.toThrow(/ya informaste/i);
  });

  it("al confirmarlo saldan las cuotas y se emite el recibo", async () => {
    const payment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "transfer",
    });

    const result = await confirmPayment(db, payment.id, staffId);

    expect(result.totalAmount).toBe(145_000);
    expect(result.receiptNumber).toMatch(/^R-\d{4}-0001$/);

    const quotas = await db.select().from(schema.quotas);
    expect(quotas.every((q) => q.status === "paid")).toBe(true);
  });

  it("al rechazarlo las cuotas siguen impagas", async () => {
    const payment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "transfer",
    });

    await rejectPayment(db, payment.id, staffId, "no figura la transferencia");

    const quotas = await db.select().from(schema.quotas);
    expect(quotas.every((q) => q.status === "pending")).toBe(true);

    const stored = (await db.select().from(schema.payments))[0];
    expect(stored.status).toBe("rejected");
  });

  it("no se puede confirmar dos veces el mismo pago", async () => {
    const payment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "transfer",
    });

    await confirmPayment(db, payment.id, staffId);
    await expect(confirmPayment(db, payment.id, staffId)).rejects.toThrow(/ya fue revisado/i);
  });

  it("avisa si la cuota se cobró por mostrador mientras esperaba confirmación", async () => {
    const portalPayment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "transfer",
    });

    // La familia además pasó por secretaría y pagó en efectivo.
    await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "cash",
      createdBy: staffId,
    });

    await expect(confirmPayment(db, portalPayment.id, staffId)).rejects.toThrow(/otra vía/i);
  });
});

describe("impacto en la caja del día", () => {
  it("un pago pendiente de confirmación no cuenta como plata en el club", async () => {
    await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "transfer",
    });

    expect((await calculateDayTotals(db, TODAY)).transferSales).toBe(0);
  });

  it("al confirmarlo, sí", async () => {
    const payment = await reportPortalPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds,
      paymentMethod: "transfer",
    });
    await confirmPayment(db, payment.id, staffId);

    expect((await calculateDayTotals(db, TODAY)).transferSales).toBe(145_000);
  });

  it("separa efectivo de transferencias", async () => {
    await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[0]],
      paymentMethod: "cash",
      createdBy: staffId,
    });
    await registerPayment(db, {
      payer: { kind: "guardian", id: guardianId },
      quotaIds: [quotaIds[1]],
      paymentMethod: "transfer",
      createdBy: staffId,
    });

    const totals = await calculateDayTotals(db, TODAY);
    expect(totals.cashSales).toBe(45_000);
    expect(totals.transferSales).toBe(45_000);
  });
});
