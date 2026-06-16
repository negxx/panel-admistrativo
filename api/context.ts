import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { verifySessionToken } from "./kimi/session";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { eq } from "drizzle-orm";
import * as cookie from "cookie";
import { Session } from "@contracts/constants";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  
  try {
    // Primero intentar OAuth de Kimi
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Si falla OAuth, intentar sesión local
    try {
      const cookies = cookie.parse(opts.req.headers.get("cookie") || "");
      const token = cookies[Session.cookieName];
      if (token) {
        const claim = await verifySessionToken(token);
        if (claim && claim.clientId === "local-auth") {
          const localUserId = parseInt(claim.unionId.replace("local_", ""));
          const db = getDb();
          const localUser = await db.select().from(schema.localUsers)
            .where(eq(schema.localUsers.id, localUserId))
            .limit(1);
          
          if (localUser[0]) {
            // Crear un User compatible con el contexto
            ctx.user = {
              id: localUser[0].id,
              unionId: `local_${localUser[0].id}`,
              name: localUser[0].name,
              email: null,
              avatar: null,
              role: localUser[0].role,
              createdAt: localUser[0].createdAt,
              updatedAt: localUser[0].createdAt,
              lastSignInAt: new Date(),
            } as User;
          }
        }
      }
    } catch (e) {
      // Silenciar errores de auth local
    }
  }
  
  return ctx;
}