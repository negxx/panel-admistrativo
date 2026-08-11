import { MONTH_NAMES } from "@contracts/constants";

/**
 * Formateo compartido por todas las pantallas.
 *
 * Antes cada página definía su propia `formatMoney`, con resultados distintos.
 */

/** `$ 45.000`. Los importes del sistema son pesos enteros, sin centavos. */
export function formatMoney(amount: number | null | undefined): string {
  return `$ ${(amount ?? 0).toLocaleString("es-AR")}`;
}

/** `15/03/2026` a partir de `2026-03-15`. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

/** `15/03/2026 14:30` a partir de un `Date`. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `Marzo 2026`. */
export function formatPeriod(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** `Mar/26`, para tablas angostas. */
export function formatShortPeriod(month: number, year: number): string {
  return `${(MONTH_NAMES[month - 1] ?? "").slice(0, 3)}/${String(year).slice(2)}`;
}

/** Fecha de hoy en formato `YYYY-MM-DD` según el reloj del navegador. */
export function todayInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Iniciales para los avatares: "Juan Pérez" → "JP". */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Edad en años a partir de una fecha `YYYY-MM-DD`. */
export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}
