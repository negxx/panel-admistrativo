import { describe, expect, it } from "vitest";
import { hashSecret, needsRehash, verifySecret } from "./crypto";

describe("hashSecret / verifySecret", () => {
  it("valida la contraseña correcta", async () => {
    const stored = await hashSecret("admin123");
    expect(await verifySecret("admin123", stored)).toBe(true);
  });

  it("rechaza la contraseña incorrecta", async () => {
    const stored = await hashSecret("admin123");
    expect(await verifySecret("admin124", stored)).toBe(false);
  });

  it("no guarda el texto plano en ningún lado", async () => {
    const stored = await hashSecret("unaClaveSecreta");
    expect(stored).not.toContain("unaClaveSecreta");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("genera hashes distintos para la misma contraseña (salt aleatoria)", async () => {
    expect(await hashSecret("igual")).not.toBe(await hashSecret("igual"));
  });

  it("acepta valores heredados en texto plano", async () => {
    // Necesario para que nadie quede afuera del sistema durante la migración.
    expect(await verifySecret("admin123", "admin123")).toBe(true);
    expect(await verifySecret("otra", "admin123")).toBe(false);
  });

  it("rechaza cuando no hay nada guardado", async () => {
    expect(await verifySecret("loquesea", null)).toBe(false);
    expect(await verifySecret("loquesea", "")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("marca los valores en texto plano para re-hashear", () => {
    expect(needsRehash("admin123")).toBe(true);
  });

  it("no toca un hash actual", async () => {
    expect(needsRehash(await hashSecret("admin123"))).toBe(false);
  });

  it("ignora los valores vacíos", () => {
    expect(needsRehash(null)).toBe(false);
  });
});
