import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Punto de entrada de Vercel.
 *
 * Los módulos se cargan con `import()` **dentro** del handler, no arriba. Así,
 * si algo falla al importar (una variable de entorno que falta, un módulo que no
 * resuelve), el error se puede capturar y responder con un mensaje entendible en
 * lugar de un `FUNCTION_INVOCATION_FAILED` pelado, que no dice nada y obliga a
 * ir a buscar los logs del panel.
 *
 * El costo es despreciable: Vercel mantiene el módulo cargado entre
 * invocaciones, así que el `import()` sólo hace trabajo la primera vez.
 */

let cachedHandler: ((req: IncomingMessage, res: ServerResponse) => unknown) | null = null;

async function buildHandler() {
  // `@hono/node-server/vercel` es el adaptador para funciones de Vercel sin
  // Next.js: adapta a la firma `(req, res)` de Node. `hono/vercel` es el de
  // Next.js App Router y acá falla.
  const { handle } = await import("@hono/node-server/vercel");
  const app = (await import("../server/boot")).default;
  return handle(app);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    cachedHandler ??= await buildHandler();
    return await cachedHandler(req, res);
  } catch (error) {
    const err = error as Error;
    console.error("[api] Falló la inicialización:", err);

    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify(
        {
          error: "El servidor no pudo inicializarse",
          detalle: err?.message ?? String(error),
          origen: (err?.stack ?? "")
            .split("\n")
            .slice(1, 5)
            .map((line) => line.trim()),
        },
        null,
        2,
      ),
    );
  }
}
