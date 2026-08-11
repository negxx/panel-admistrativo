import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "../contracts/constants";
import { runMaintenance } from "./domain/maintenance";

/**
 * La aplicación Hono.
 *
 * Este módulo sólo **define** la app; no la pone a escuchar. Quién la sirve
 * depende del entorno:
 *
 *   - En desarrollo, `@hono/vite-dev-server` la monta dentro de Vite.
 *   - En Vercel, `api/index.ts` la envuelve como función serverless.
 *   - En un servidor común, `server/serve.ts` la levanta con `node:http`.
 *
 * Separarlo así es lo que permite que el mismo backend corra en los tres lados
 * sin cambios: en serverless no puede haber un `listen()` colgado al importar.
 */
const app = new Hono();

// 5 MB alcanza de sobra para JSON. Antes eran 50 MB, que en serverless es un
// techo irreal y además un vector de abuso.
app.use(bodyLimit({ maxSize: 5 * 1024 * 1024 }));

app.get(Paths.oauthCallback, createOAuthCallbackHandler());

app.use("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  }),
);

/**
 * Tareas de mantenimiento, disparadas por el cron de Vercel.
 *
 * En un servidor único, `syncOverdueQuotas` corría en cada consulta y alcanzaba.
 * Contra una base remota eso son dos escrituras por cada lectura, así que el
 * grueso del trabajo se hace una vez por día acá.
 *
 * Se protege con `CRON_SECRET` para que no lo pueda disparar cualquiera.
 */
app.get("/api/cron/maintenance", async (c) => {
  const expected = process.env.CRON_SECRET;
  const provided = c.req.header("authorization")?.replace("Bearer ", "");

  if (!expected || provided !== expected) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const result = await runMaintenance();
  return c.json({ ok: true, ...result });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;
