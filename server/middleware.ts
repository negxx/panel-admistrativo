import { ErrorMessages } from "../contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;

/**
 * Los cuatro niveles de acceso del sistema.
 *
 * Antes casi todo el backend usaba `publicQuery`: sin ninguna sesión se podía
 * listar a todos los socios (menores de edad, con DNI, dirección y teléfono),
 * crear y borrar jugadores, cambiar montos y marcar cuotas como pagadas. Ahora
 * cada procedimiento declara explícitamente quién puede llamarlo.
 */

/** Sin sesión. Sólo para el ping y el login. */
export const publicProcedure = t.procedure;

const requireStaff = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requirePortal = t.middleware(({ ctx, next }) => {
  if (!ctx.portal) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.portalUnauthenticated,
    });
  }
  return next({ ctx: { ...ctx, portal: ctx.portal } });
});

/** Cualquier usuario del panel: `admin` o `secretary`. El día a día del club. */
export const staffProcedure = t.procedure.use(requireStaff);

/** Sólo `admin`: usuarios, categorías, configuración y borrado de cierres. */
export const adminProcedure = t.procedure.use(requireAdmin);

/** Un socio o tutor autenticado en el portal, identificado por su cookie. */
export const portalProcedure = t.procedure.use(requirePortal);

/**
 * Alias heredados. Se mantienen para no romper imports viejos, pero el código
 * nuevo debería usar los nombres de arriba.
 * @deprecated
 */
export const publicQuery = publicProcedure;
/** @deprecated usar `staffProcedure` */
export const authedQuery = staffProcedure;
/** @deprecated usar `adminProcedure` */
export const adminQuery = adminProcedure;
