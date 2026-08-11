import { describe, expect, it } from "vitest";
import { addDays, buildDate, daysBetween, isValidDate } from "./dates";

describe("addDays", () => {
  it("suma días dentro del mismo mes", () => {
    expect(addDays("2026-03-10", 5)).toBe("2026-03-15");
  });

  it("cruza el fin de mes", () => {
    expect(addDays("2026-03-30", 3)).toBe("2026-04-02");
  });

  it("cruza el fin de año", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("resta con números negativos", () => {
    expect(addDays("2026-03-02", -3)).toBe("2026-02-27");
  });

  it("maneja febrero de un año bisiesto", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("cuenta los días entre dos fechas", () => {
    expect(daysBetween("2026-03-10", "2026-03-20")).toBe(10);
  });

  it("es negativo si la segunda fecha es anterior", () => {
    expect(daysBetween("2026-03-20", "2026-03-10")).toBe(-10);
  });

  it("da cero para la misma fecha", () => {
    expect(daysBetween("2026-03-10", "2026-03-10")).toBe(0);
  });
});

describe("buildDate", () => {
  it("arma la fecha con ceros a la izquierda", () => {
    expect(buildDate(2026, 3, 5)).toBe("2026-03-05");
  });

  it("ajusta el día si no existe en ese mes", () => {
    // Un vencimiento el día 31 en febrero cae al último día real del mes.
    expect(buildDate(2026, 2, 31)).toBe("2026-02-28");
  });
});

describe("isValidDate", () => {
  it("acepta fechas reales", () => {
    expect(isValidDate("2026-03-15")).toBe(true);
  });

  it("rechaza días que no existen", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
  });

  it("rechaza formatos distintos", () => {
    expect(isValidDate("15/03/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});
