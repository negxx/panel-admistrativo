/** Utilidades de color hex para teñir el portal con los colores del club. */

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/** Mezcla el color con blanco (amount > 0) o con negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const target = amount >= 0 ? 255 : 0;
  const mix = (c: number) => Math.round(c + (target - c) * Math.abs(amount));
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Convierte hex a "r g b" para usarlo dentro de hsl()/rgb() de CSS. */
export function hexToRgbTriplet(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `${r} ${g} ${b}`;
}

/**
 * Elige el color de texto legible sobre un fondo: negro sobre claros,
 * blanco sobre oscuros (umbral de luminancia relativa).
 */
export function contrastText(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#101223" : "#ffffff";
}
