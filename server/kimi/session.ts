import * as jose from "jose";
import { env } from "../lib/env";
import { Session } from "../../contracts/constants";
import type { SessionPayload } from "./types";

const JWT_ALG = "HS256";

/**
 * Token de sesión del panel administrativo.
 *
 * La duración sale de `Session.expiration` (7 días). Antes estaba fija en
 * "1 year": una cookie filtrada servía para siempre.
 */
export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(Session.expiration)
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    const { unionId, clientId } = payload;
    if (!unionId || !clientId) return null;
    return { unionId, clientId } as SessionPayload;
  } catch {
    // Token vencido, manipulado o firmado con otro secreto. En todos los casos
    // el resultado es el mismo: no hay sesión.
    return null;
  }
}
