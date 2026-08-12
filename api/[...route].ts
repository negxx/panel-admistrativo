import { handle } from "@hono/node-server/vercel";
import app from "../server/boot";

/**
 * Punto de entrada de Vercel.
 *
 * **Ojo con el adaptador.** Hay dos y no son intercambiables:
 *
 *   - `hono/vercel` es para Next.js App Router: devuelve un handler de tipo Web
 *     (`Request` → `Response`).
 *   - `@hono/node-server/vercel` es para funciones de Vercel sin Next.js, que es
 *     nuestro caso: adapta a la firma `(req, res)` de Node que Vercel realmente
 *     usa al invocarlas.
 *
 * Usar el primero hacía que Vercel le pasara un objeto de Node donde esperaba un
 * `Request`, y la función fallaba con `FUNCTION_INVOCATION_FAILED` en todos los
 * endpoints.
 *
 * El nombre `[...route].ts` es una ruta comodín: Vercel manda acá todo lo que
 * empiece con `/api/` conservando la ruta completa, que es lo que Hono necesita
 * para rutear internamente.
 *
 * Todo el backend vive en `server/` porque Vercel convierte en función
 * serverless cada archivo dentro de `api/`.
 */
export default handle(app);
