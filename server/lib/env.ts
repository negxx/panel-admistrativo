import "dotenv/config";

/**
 * Variables de entorno.
 *
 * Sólo dos son **obligatorias**: sin base de datos y sin secreto de sesión el
 * sistema no puede funcionar. Todo lo demás es opcional.
 *
 * El login por OAuth de Kimi es una vía alternativa que la mayoría de los clubes
 * no usa: alcanza con el login local de usuario y contraseña. Antes sus tres
 * variables estaban marcadas como obligatorias, así que un despliegue sin ellas
 * **se caía al arrancar** con un 500 en todos los endpoints, aunque nadie fuera
 * a usar esa función.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        (name === "DATABASE_URL"
          ? "Es la cadena de conexión del pooler de Supabase (puerto 6543)."
          : "Con ella se firman las cookies de sesión."),
    );
  }
  return value;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

/** Lo mínimo para que el sistema arranque. */
const appSecret = required("APP_SECRET");
const databaseUrl = required("DATABASE_URL");

const kimiAuthUrl = optional("KIMI_AUTH_URL");
const kimiOpenUrl = optional("KIMI_OPEN_URL");
const appId = optional("APP_ID");

export const env = {
  appSecret,
  databaseUrl,
  isProduction: process.env.NODE_ENV === "production",

  // ─── OAuth de Kimi (opcional) ──────────────────────────────────────────────
  appId,
  kimiAuthUrl,
  kimiOpenUrl,
  ownerUnionId: optional("OWNER_UNION_ID"),

  /**
   * `true` sólo si las tres variables del OAuth están configuradas. El resto del
   * código consulta esto antes de intentar usar esa vía.
   */
  kimiEnabled: Boolean(appId && kimiAuthUrl && kimiOpenUrl),
};
