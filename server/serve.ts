import { serve } from "@hono/node-server";
import app from "./boot";
import { serveStaticFiles } from "./lib/vite";

/**
 * Arranque para un servidor común (VPS, Railway, Fly, Docker).
 *
 * En Vercel este archivo no se usa: allá el punto de entrada es `api/index.ts`,
 * que envuelve la misma app como función serverless. Tener los dos permite
 * mudar de hosting sin tocar el backend.
 */
serveStaticFiles(app);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Servidor escuchando en http://localhost:${port}/`);
});
