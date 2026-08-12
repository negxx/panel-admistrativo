import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "@hono/node-server/vercel";
import app from "../server-dist/app.mjs";

/**
 * Punto de entrada de Vercel.
 *
 * Importa el servidor **ya empaquetado en un único archivo** (`server-dist/app.mjs`,
 * generado por `npm run build:vercel`). Antes importaba `../server/boot` y fallaba
 * con `Cannot find module '/var/task/server/boot'`, por dos motivos encadenados:
 *
 *   1. Vercel no incluía la carpeta `server/` en el paquete de la función.
 *   2. El proyecto es ESM, donde los imports sin extensión no resuelven en Node.
 *      Agregar `.js` a mano habría implicado tocar los cientos de imports
 *      internos de `server/`.
 *
 * Empaquetar resuelve las dos de una: el archivo no tiene imports relativos.
 *
 * `@hono/node-server/vercel` es el adaptador correcto para funciones de Vercel
 * sin Next.js: adapta a la firma `(req, res)` de Node. `hono/vercel` es el de
 * Next.js App Router y acá falla con `FUNCTION_INVOCATION_FAILED`.
 */
const honoHandler = handle(app);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return honoHandler(req, res);
}
