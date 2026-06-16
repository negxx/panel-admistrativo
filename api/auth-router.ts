import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { signSessionToken } from "./kimi/session";

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),

  // Login local con usuario/password
  loginLocal: publicQuery.input(
    z.object({
      username: z.string(),
      password: z.string(),
    })
  ).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const user = await db.select().from(schema.localUsers)
      .where(eq(schema.localUsers.username, input.username))
      .limit(1);

    if (!user[0] || user[0].password !== input.password) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Usuario o contraseña incorrectos",
      });
    }

    const token = await signSessionToken({
      unionId: `local_${user[0].id}`,
      clientId: "local-auth",
    });

    const cookieOpts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, token, {
        httpOnly: cookieOpts.httpOnly,
        path: cookieOpts.path,
        sameSite: cookieOpts.sameSite?.toLowerCase() as "lax" | "none",
        secure: cookieOpts.secure,
        maxAge: Session.maxAgeMs / 1000,
      }),
    );

    return {
      success: true,
      user: {
        id: user[0].id,
        name: user[0].name,
        role: user[0].role,
      },
    };
  }),
});