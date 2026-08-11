import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

/**
 * Opciones de la cookie de sesión del panel.
 *
 * `sameSite: "Lax"` en todos los entornos. Antes fuera de localhost se usaba
 * `"None"`, que permite que cualquier sitio de internet dispare peticiones
 * autenticadas contra la API (CSRF). El panel y la API se sirven desde el mismo
 * dominio, así que `Lax` alcanza y de paso corta ese vector.
 *
 * `secure` sigue atado a localhost para que el desarrollo por HTTP funcione.
 */
export function getSessionCookieOptions(headers: Headers): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: !isLocalhost(headers),
  };
}
