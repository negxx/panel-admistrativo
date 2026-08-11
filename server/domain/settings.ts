import * as schema from "../../db/schema";
import type { DbClient } from "../queries/connection";

/**
 * Configuración global del club, guardada en la tabla `settings` como pares
 * clave/valor de texto. Este módulo es el único lugar que sabe qué claves
 * existen y qué tipo tiene cada una.
 */
export type ClubSettings = {
  /** Interés diario por mora, en porcentaje. `0.5` = 0,5 % por día. */
  interestRate: number;
  /** Días de tolerancia después del vencimiento antes de cobrar interés. */
  graceDays: number;
  /** Día del mes en el que vencen las cuotas. */
  dueDay: number;
  /** Si está apagado, no se aplica descuento por hermanos al generar cuotas. */
  discountEnabled: boolean;
  /** Descuento por hermanos a usar cuando la categoría no define uno propio. */
  discountPercent: number;
  /** Datos bancarios que se le muestran al socio en el portal. */
  bankName: string;
  bankCbu: string;
  bankAlias: string;
  bankHolder: string;
  /** Nombre del club, usado en mensajes y recibos. */
  clubName: string;
};

export const DEFAULT_SETTINGS: ClubSettings = {
  interestRate: 0.5,
  graceDays: 3,
  dueDay: 10,
  discountEnabled: true,
  discountPercent: 10,
  bankName: "",
  bankCbu: "",
  bankAlias: "",
  bankHolder: "",
  clubName: "Club Atlético",
};

/** Lee toda la configuración, completando con los valores por defecto. */
export async function getSettings(db: DbClient): Promise<ClubSettings> {
  const rows = await db.select().from(schema.settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const num = (key: keyof ClubSettings, fallback: number) => {
    const parsed = Number(map.get(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const str = (key: keyof ClubSettings, fallback: string) => map.get(key) ?? fallback;

  return {
    interestRate: num("interestRate", DEFAULT_SETTINGS.interestRate),
    graceDays: Math.max(0, Math.trunc(num("graceDays", DEFAULT_SETTINGS.graceDays))),
    dueDay: Math.min(28, Math.max(1, Math.trunc(num("dueDay", DEFAULT_SETTINGS.dueDay)))),
    discountEnabled: (map.get("discountEnabled") ?? "true") === "true",
    discountPercent: num("discountPercent", DEFAULT_SETTINGS.discountPercent),
    bankName: str("bankName", DEFAULT_SETTINGS.bankName),
    bankCbu: str("bankCbu", DEFAULT_SETTINGS.bankCbu),
    bankAlias: str("bankAlias", DEFAULT_SETTINGS.bankAlias),
    bankHolder: str("bankHolder", DEFAULT_SETTINGS.bankHolder),
    clubName: str("clubName", DEFAULT_SETTINGS.clubName),
  };
}

/** Guarda un subconjunto de la configuración. */
export async function saveSettings(db: DbClient, values: Partial<ClubSettings>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db
      .insert(schema.settings)
      .values({ key, value: String(value), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: String(value), updatedAt: new Date() },
      });
  }
}

/** Sólo los datos bancarios: es lo único de `settings` que ve el portal público. */
export async function getPublicBankInfo(db: DbClient) {
  const s = await getSettings(db);
  return {
    clubName: s.clubName,
    bankName: s.bankName,
    bankCbu: s.bankCbu,
    bankAlias: s.bankAlias,
    bankHolder: s.bankHolder,
  };
}
