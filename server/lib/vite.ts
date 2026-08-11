import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "node:fs";
import path from "node:path";

/**
 * Sirve el sitio compilado desde el propio servidor Node.
 *
 * Sólo se usa cuando la app corre en un servidor común (VPS, Docker, Railway).
 * En Vercel los archivos estáticos los sirve la CDN y esta función no se llama.
 *
 * Se tipa contra `Hono` a secas —sin `HttpBindings`— para que la misma app
 * pueda montarse tanto acá como en el adaptador serverless.
 */
export function serveStaticFiles(app: Hono) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  app.use("*", serveStatic({ root: "./dist/public" }));

  // Cualquier ruta que no sea de la API devuelve el index: el ruteo lo resuelve
  // React en el navegador.
  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.html(fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8"));
  });
}
