import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import * as cookie from "cookie";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { Session } from "../contracts/constants";
import { authenticateRequest } from "./kimi/auth";
import { verifySessionToken } from "./kimi/session";
import { getDb } from "./queries/connection";
import { readPortalSession, type PortalIdentity } from "./lib/portal-session";

/**
 * Usuario del panel, ya normalizado.
 *
 * Puede venir de dos lados: del login local (tabla `local_users`) o del OAuth de
 * Kimi (tabla `users`). El resto del backend no necesita saber de cuál, sólo le
 * importa el `role`.
 */
export type SessionUser = {
  id: number;
  name: string;
  role: "admin" | "secretary";
  source: "local" | "kimi";
};

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** Usuario del panel administrativo, si hay sesión. */
  user?: SessionUser;
  /** Socio o tutor autenticado en el portal público, si hay sesión. */
  portal?: PortalIdentity;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  ctx.user = (await resolveLocalUser(opts.req.headers)) ?? (await resolveKimiUser(opts.req.headers));
  ctx.portal = (await readPortalSession(opts.req.headers)) ?? undefined;

  return ctx;
}

/**
 * Sesión del login local (usuario y contraseña).
 *
 * El token lleva `unionId: "local_<id>"`, así que se extrae el id y se relee el
 * usuario de la base en cada request: si a alguien le cambian el rol o lo
 * borran, deja de tener acceso en el acto sin esperar a que expire la cookie.
 */
async function resolveLocalUser(headers: Headers): Promise<SessionUser | undefined> {
  try {
    const cookies = cookie.parse(headers.get("cookie") || "");
    const token = cookies[Session.cookieName];
    if (!token) return undefined;

    const claim = await verifySessionToken(token);
    if (!claim || claim.clientId !== "local-auth") return undefined;

    const localUserId = Number(claim.unionId.replace("local_", ""));
    if (!Number.isInteger(localUserId) || localUserId <= 0) return undefined;

    const localUser = (
      await getDb()
        .select()
        .from(schema.localUsers)
        .where(eq(schema.localUsers.id, localUserId))
        .limit(1)
    )[0];

    if (!localUser) return undefined;

    return {
      id: localUser.id,
      name: localUser.name,
      role: localUser.role,
      source: "local",
    };
  } catch (error) {
    console.error("[auth] Falló la lectura de la sesión local:", error);
    return undefined;
  }
}

/**
 * Sesión del OAuth de Kimi.
 *
 * El rol `admin` de esa tabla se mapea a `admin`; cualquier otro entra como
 * `secretary`, que es el permiso mínimo para operar el panel.
 */
async function resolveKimiUser(headers: Headers): Promise<SessionUser | undefined> {
  try {
    const user = await authenticateRequest(headers);
    if (!user) return undefined;
    return {
      id: user.id,
      name: user.name ?? "Usuario",
      role: user.role === "admin" ? "admin" : "secretary",
      source: "kimi",
    };
  } catch {
    // Sin cookie de Kimi o token inválido: simplemente no hay sesión por esa vía.
    return undefined;
  }
}
