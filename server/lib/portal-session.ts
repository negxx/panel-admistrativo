/**
 * Sesión del portal de socios.
 *
 * Antes la identidad del socio vivía en `localStorage.portalGuardianId` y cada
 * endpoint confiaba en el id que le mandaba el navegador: cambiando ese número
 * en la consola se veía la deuda de otra familia y se podía pagar en su nombre.
 *
 * Ahora la identidad viaja en una cookie httpOnly firmada (JWT) que el
 * navegador no puede leer ni editar, y el backend la deriva de ahí. El frontend
 * nunca vuelve a mandar un id de socio.
 */
import * as cookie from "cookie";
import * as jose from "jose";
import { env } from "./env";
import { PortalSession } from "../../contracts/constants";

const JWT_ALG = "HS256";

/** A quién pertenece la sesión del portal. */
export type PortalIdentity = {
  /** `guardian`: un tutor con hijos a cargo. `player`: un socio sin tutor. */
  kind: "guardian" | "player";
  /** Id en la tabla `guardians` o `players`, según `kind`. */
  id: number;
};

export async function signPortalToken(identity: PortalIdentity): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ kind: identity.kind, sub: String(identity.id) })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(PortalSession.expiration)
    .sign(secret);
}

export async function verifyPortalToken(token: string): Promise<PortalIdentity | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    const kind = payload.kind;
    const id = Number(payload.sub);
    if ((kind !== "guardian" && kind !== "player") || !Number.isInteger(id) || id <= 0) {
      return null;
    }
    return { kind, id };
  } catch {
    return null;
  }
}

/** Lee la identidad del portal desde las cookies del request. */
export async function readPortalSession(headers: Headers): Promise<PortalIdentity | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[PortalSession.cookieName];
  if (!token) return null;
  return verifyPortalToken(token);
}

/**
 * Opciones de la cookie del portal.
 *
 * `sameSite: "lax"` protege contra CSRF y alcanza porque el portal y la API
 * viven en el mismo dominio. `secure` se activa solo fuera de localhost para
 * que el desarrollo por HTTP siga funcionando.
 */
export function portalCookieOptions(headers: Headers) {
  const host = headers.get("host") || "";
  const isLocalhost = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: !isLocalhost,
  };
}

/** Header `set-cookie` que inicia la sesión del portal. */
export function buildPortalCookie(headers: Headers, token: string): string {
  return cookie.serialize(PortalSession.cookieName, token, {
    ...portalCookieOptions(headers),
    maxAge: PortalSession.maxAgeSeconds,
  });
}

/** Header `set-cookie` que cierra la sesión del portal. */
export function buildPortalLogoutCookie(headers: Headers): string {
  return cookie.serialize(PortalSession.cookieName, "", {
    ...portalCookieOptions(headers),
    maxAge: 0,
  });
}
