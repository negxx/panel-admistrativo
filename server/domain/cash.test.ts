import { describe, expect, it } from "vitest";
import { expectedCashFor, type CashTotals } from "./cash";

const totals: CashTotals = {
  cashSales: 100_000,
  transferSales: 50_000,
  mpSales: 25_000,
  otherIncome: 30_000,
  otherCashIncome: 20_000,
  totalIncome: 205_000,
  totalExpenses: 40_000,
  cashExpenses: 15_000,
};

describe("expectedCashFor", () => {
  it("suma apertura, cobros en efectivo e ingresos manuales en efectivo", () => {
    // 10.000 + 100.000 + 20.000 − 15.000
    expect(expectedCashFor(10_000, totals)).toBe(115_000);
  });

  it("NO cuenta transferencias ni MercadoPago", () => {
    // Esa plata no está en el cajón, así que no puede figurar en el arqueo.
    const sinDigital = { ...totals, transferSales: 0, mpSales: 0 };
    expect(expectedCashFor(10_000, sinDigital)).toBe(expectedCashFor(10_000, totals));
  });

  it("descuenta los egresos pagados en efectivo", () => {
    // La versión anterior no los restaba: cualquier gasto del día aparecía como
    // faltante de caja al cerrar.
    const sinGastos = { ...totals, cashExpenses: 0 };
    expect(expectedCashFor(10_000, sinGastos) - expectedCashFor(10_000, totals)).toBe(15_000);
  });

  it("una caja sin movimientos devuelve exactamente lo de la apertura", () => {
    const vacio: CashTotals = {
      cashSales: 0,
      transferSales: 0,
      mpSales: 0,
      otherIncome: 0,
      otherCashIncome: 0,
      totalIncome: 0,
      totalExpenses: 0,
      cashExpenses: 0,
    };
    expect(expectedCashFor(5_000, vacio)).toBe(5_000);
  });
});
