import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Session } from "../contracts/constants";
import * as schema from "../db/schema";
import { getSessionCookieOptions } from "./lib/cookies";
import { hashSecret, needsRehash, verifySecret } from "./lib/crypto";
import { checkRateLimit, clearAttempts, LOGIN_LIMIT, registerFailure } from "./lib/rate-limit";
import { createRouter, staffProcedure, publicProcedure } from "./middleware";
import { getDb } from "./queries/connection";
import { signSessionToken } from "./kimi/session";

export const authRouter = createRouter({
  /** Datos del usuario logueado. El frontend lo usa para saber si hay sesión. */
  me: staffProcedure.query(({ ctx }) => ctx.user),

  logout: staffProcedure.mutation(({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: "lax",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),

  /**
   * Login con usuario y contraseña.
   *
   * Tres cosas que antes no estaban:
   *
   *  - La contraseña se compara contra un **hash scrypt**, no contra texto plano.
   *  - Si el usuario todavía tiene la contraseña vieja sin hashear, se valida
   *    igual y se re-hashea en silencio: nadie queda afuera durante la migración.
   *  - Hay **límite de intentos** por usuario. Sin eso, probar contraseñas era
   *    gratis e ilimitado.
   */
  loginLocal: publicProcedure
    .input(
      z.object({
        username: z.string().min(1, "Ingresá tu usuario"),
        password: z.string().min(1, "Ingresá tu contraseña"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rateKey = `login:${input.username.toLowerCase()}`;

      const limit = await checkRateLimit(db, rateKey, LOGIN_LIMIT);
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Demasiados intentos fallidos. Probá de nuevo en ${Math.ceil(limit.retryAfterSeconds / 60)} minutos.`,
        });
      }

      const user = (
        await db
          .select()
          .from(schema.localUsers)
          .where(eq(schema.localUsers.username, input.username))
          .limit(1)
      )[0];

      const passwordOk = user ? await verifySecret(input.password, user.password) : false;

      if (!user || !passwordOk) {
        await registerFailure(db, rateKey, LOGIN_LIMIT);
        // Mismo mensaje para usuario inexistente y contraseña incorrecta: no le
        // confirmamos a nadie qué usuarios existen.
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Usuario o contraseña incorrectos",
        });
      }

      await clearAttempts(db, rateKey);

      if (needsRehash(user.password)) {
        const upgraded = await hashSecret(input.password);
        await db
          .update(schema.localUsers)
          .set({ password: upgraded })
          .where(eq(schema.localUsers.id, user.id));
      }

      const token = await signSessionToken({
        unionId: `local_${user.id}`,
        clientId: "local-auth",
      });

      const cookieOpts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(Session.cookieName, token, {
          httpOnly: cookieOpts.httpOnly,
          path: cookieOpts.path,
          sameSite: "lax",
          secure: cookieOpts.secure,
          maxAge: Session.maxAgeMs / 1000,
        }),
      );

      return {
        success: true,
        user: { id: user.id, name: user.name, role: user.role },
      };
    }),

  /** Cambio de contraseña propio. No necesita ser admin. */
  changePassword: staffProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, "La nueva contraseña necesita al menos 6 caracteres"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.source !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tu cuenta se administra desde Kimi, no tiene contraseña local",
        });
      }

      const db = getDb();
      const user = (
        await db
          .select()
          .from(schema.localUsers)
          .where(eq(schema.localUsers.id, ctx.user.id))
          .limit(1)
      )[0];

      if (!user || !(await verifySecret(input.currentPassword, user.password))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "La contraseña actual no coincide" });
      }

      await db
        .update(schema.localUsers)
        .set({ password: await hashSecret(input.newPassword) })
        .where(eq(schema.localUsers.id, user.id));

      return { success: true };
    }),
});
