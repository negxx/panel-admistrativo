import { describe, expect, it } from "vitest";
import { calculateInterest, calculateSiblingDiscount, quotaTotal } from "./quotas";

/**
 * Tests de las reglas de plata.
 *
 * Son las cuentas que le llegan a la familia en el mensaje de deuda: si esto se
 * rompe, el club cobra de más o de menos. Cada caso documenta una decisión de
 * negocio concreta.
 */

const base = {
  baseAmount: 50_000,
  discountAmount: 0,
  dueDate: "2026-03-10",
  dailyRatePercent: 0.5,
  graceDays: 3,
};

describe("calculateInterest", () => {
  it("no cobra interés antes del vencimiento", () => {
    expect(calculateInterest({ ...base, today: "2026-03-05" })).toEqual({
      overdueDays: 0,
      interest: 0,
    });
  });

  it("no cobra interés el mismo día del vencimiento", () => {
    expect(calculateInterest({ ...base, today: "2026-03-10" }).interest).toBe(0);
  });

  it("respeta los días de gracia", () => {
    // Vence el 10, con 3 días de gracia el último día sin interés es el 13.
    expect(calculateInterest({ ...base, today: "2026-03-13" }).interest).toBe(0);
    expect(calculateInterest({ ...base, today: "2026-03-14" }).overdueDays).toBe(1);
  });

  it("cobra interés simple por día de atraso", () => {
    // 10 días después de la gracia: 50.000 × 0,5 % × 10 = 2.500
    const result = calculateInterest({ ...base, today: "2026-03-23" });
    expect(result.overdueDays).toBe(10);
    expect(result.interest).toBe(2_500);
  });

  it("calcula el interés sobre el monto NETO, no sobre el de lista", () => {
    // Con 10 % de descuento por hermanos el neto es 45.000.
    // 45.000 × 0,5 % × 10 = 2.250, no 2.500.
    // La versión anterior usaba el monto de lista y cobraba interés de más.
    const result = calculateInterest({
      ...base,
      discountAmount: 5_000,
      today: "2026-03-23",
    });
    expect(result.interest).toBe(2_250);
  });

  it("no cobra interés si la tasa está en cero", () => {
    expect(
      calculateInterest({ ...base, dailyRatePercent: 0, today: "2026-06-01" }).interest,
    ).toBe(0);
  });

  it("funciona cruzando el cambio de mes", () => {
    // Vence el 28/02/2026, gracia hasta el 03/03. Al 08/03 son 5 días.
    const result = calculateInterest({
      ...base,
      dueDate: "2026-02-28",
      today: "2026-03-08",
    });
    expect(result.overdueDays).toBe(5);
  });
});

describe("quotaTotal", () => {
  it("suma base menos descuento más interés", () => {
    expect(quotaTotal(50_000, 5_000, 2_250)).toBe(47_250);
  });

  it("nunca devuelve un total negativo", () => {
    expect(quotaTotal(10_000, 99_000, 0)).toBe(0);
  });
});

describe("calculateSiblingDiscount", () => {
  const input = {
    baseAmount: 50_000,
    siblingCount: 2,
    categoryDiscountPercent: 10,
    fallbackPercent: 5,
    discountEnabled: true,
  };

  it("aplica el porcentaje de la categoría cuando hay hermanos", () => {
    expect(calculateSiblingDiscount(input)).toBe(5_000);
  });

  it("NO aplica descuento a un hijo único", () => {
    // Antes alcanzaba con que la categoría tuviera un porcentaje cargado:
    // se le descontaba a familias con un solo socio.
    expect(calculateSiblingDiscount({ ...input, siblingCount: 1 })).toBe(0);
  });

  it("usa el porcentaje global cuando la categoría no define uno", () => {
    expect(calculateSiblingDiscount({ ...input, categoryDiscountPercent: 0 })).toBe(2_500);
  });

  it("no aplica nada si el descuento está apagado globalmente", () => {
    expect(calculateSiblingDiscount({ ...input, discountEnabled: false })).toBe(0);
  });

  it("no permite descontar más del 100 %", () => {
    expect(calculateSiblingDiscount({ ...input, categoryDiscountPercent: 150 })).toBe(50_000);
  });
});
