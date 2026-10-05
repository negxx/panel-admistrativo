import { describe, expect, it } from "vitest";
import { findAccount } from "./wa-assistant";
import { toJid } from "./whatsapp";

/**
 * Helpers puros del bot y del asistente: la normalización de teléfonos
 * argentinos y la identificación del socio por su número.
 */

describe("toJid", () => {
  it("agrega 549 a un número nacional común", () => {
    expect(toJid("11 2345-6789")).toBe("5491123456789@s.whatsapp.net");
  });

  it("saca el 0 adelante y el 15 del celular", () => {
    expect(toJid("011 15 2345-6789")).toBe("5491123456789@s.whatsapp.net");
  });

  it("respeta el número que ya viene en formato internacional", () => {
    expect(toJid("5491123456789")).toBe("5491123456789@s.whatsapp.net");
  });

  it("ignora espacios, guiones y paréntesis", () => {
    expect(toJid("(+54) 9 11-2345-6789")).toBe("5491123456789@s.whatsapp.net");
  });
});

describe("findAccount", () => {
  const candidates = [
    { kind: "guardian" as const, id: 1, name: "María", phone: "11 15 2345-6789" },
    { kind: "player" as const, id: 2, name: "Juan", phone: "342-555-1234" },
    { kind: "guardian" as const, id: 3, name: "Sin teléfono", phone: null },
  ];

  it("encuentra al tutor aunque WhatsApp mande el número con 549", () => {
    expect(findAccount(candidates, "5491123456789")).toEqual({
      kind: "guardian",
      id: 1,
      name: "María",
    });
  });

  it("encuentra al socio sin tutor", () => {
    expect(findAccount(candidates, "5493425551234")).toEqual({
      kind: "player",
      id: 2,
      name: "Juan",
    });
  });

  it("devuelve null con un número desconocido", () => {
    // Mismos últimos 10 dígitos que nadie tiene.
    expect(findAccount(candidates, "5491199999999")).toBeNull();
  });

  it("no confunde a quien no tiene teléfono cargado", () => {
    expect(findAccount(candidates, "")).toBeNull();
  });
});
