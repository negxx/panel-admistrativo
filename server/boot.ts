import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "../contracts/constants";
import { runMaintenance } from "./domain/maintenance";
import { verifyWebhook, extractIncomingMessages, sendCloudText } from "./services/whatsapp-cloud";
import { handleMessageFromPhone } from "./services/wa-assistant";

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

app.get("/health", (c) => c.text("ok"));

/**
 * Webhook oficial de WhatsApp Cloud API (Meta).
 */
app.get("/api/webhook/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const verified = verifyWebhook(mode, token, challenge);
  if (verified) {
    return c.text(verified, 200);
  }
  return c.text("Forbidden", 403);
});

app.post("/api/webhook/whatsapp", async (c) => {
  try {
    const body = await c.req.json();
    const messages = extractIncomingMessages(body);

    console.log(`[webhook] Recibido POST con ${messages.length} mensaje(s)`);

    for (const msg of messages) {
      console.log(`[webhook] Mensaje de ${msg.phone}: "${msg.text}"`);
      const reply = await handleMessageFromPhone(msg.phone, msg.text);
      if (reply) {
        console.log(`[webhook] Respuesta para ${msg.phone}: "${reply.slice(0, 80)}..."`);
        const sent = await sendCloudText(msg.phone, reply);
        console.log(`[webhook] Envío a ${msg.phone}: ${sent ? "OK" : "FALLÓ"}`);
      } else {
        console.log(`[webhook] Sin respuesta para ${msg.phone} (rate-limit o error)`);
      }
    }

    return c.text("EVENT_RECEIVED", 200);
  } catch (err) {
    console.error("[webhook-whatsapp] Error procesando mensaje:", err);
    return c.text("EVENT_RECEIVED", 200);
  }
});

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
