/**
 * Utilidades de fecha.
 *
 * Todo el sistema trabaja con fechas en formato `YYYY-MM-DD` (string) y en la
 * zona horaria del club. Antes se usaba `new Date().toISOString()`, que devuelve
 * UTC: entre las 21:00 y las 00:00 de Argentina eso daba el día siguiente, y los
 * pagos de la noche caían en el cierre de caja del día equivocado.
 */

/** Zona horaria del club. Cambiala acá si el club no está en Argentina. */
export const CLUB_TIMEZONE = "America/Argentina/Buenos_Aires";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en la zona del club, como `YYYY-MM-DD`. */
export function today(): string {
  return dateFormatter.format(new Date());
}

/** Año-mes actual en la zona del club, como `YYYY-MM`. */
export function currentYearMonth(): string {
  return today().slice(0, 7);
}

/** Año actual en la zona del club. */
export function currentYear(): number {
  return Number(today().slice(0, 4));
}

/** Mes actual (1-12) en la zona del club. */
export function currentMonth(): number {
  return Number(today().slice(5, 7));
}

/**
 * Suma (o resta, con números negativos) días a una fecha `YYYY-MM-DD`.
 * Opera a mediodía UTC para que el horario de verano nunca corra el día.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Días completos entre dos fechas `YYYY-MM-DD` (`to - from`).
 * Positivo si `to` es posterior.
 */
export function daysBetween(from: string, to: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Arma una fecha `YYYY-MM-DD` a partir de año, mes (1-12) y día. */
export function buildDate(year: number, month: number, day: number): string {
  // Si el día no existe en ese mes (ej: 31 de febrero), usa el último día del mes.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/** `true` si el string tiene formato `YYYY-MM-DD` y es una fecha real. */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= lastDay;
}
