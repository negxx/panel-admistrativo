import { handle } from "@hono/node-server/vercel";
import app from "../server/boot";

/**
 * Punto de entrada de Vercel.
 *
 * **El adaptador importa.** Hay dos y no son intercambiables:
 *
 *   - `hono/vercel` es para Next.js App Router: devuelve un handler de tipo Web
 *     (`Request` → `Response`).
 *   - `@hono/node-server/vercel` es para funciones de Vercel sin Next.js, que es
 *     nuestro caso: adapta a la firma `(req, res)` de Node que Vercel usa al
 *     invocarlas.
 *
 * Usar el primero hacía que Vercel le pasara un objeto de Node donde esperaba un
 * `Request`, y fallaba con `FUNCTION_INVOCATION_FAILED` en todos los endpoints.
 *
 * El ruteo lo hace el rewrite de `vercel.json`, que manda `/api/*` acá. El
 * rewrite **conserva la ruta original** en el request, así que Hono ve
 * `/api/trpc/loquesea` y rutea normalmente.
 *
 * Todo el backend vive en `server/` porque Vercel convierte en función
 * serverless cada archivo dentro de `api/`: si estuviera acá, cada router y cada
 * helper se publicaría como un endpoint separado.
 */
export default handle(app);
