import type { Hono } from "hono";

/**
 * Tipos del servidor ya empaquetado.
 *
 * El archivo `app.mjs` de al lado lo genera el build (`npm run build:server`) y
 * no se versiona. Esta declaración existe para que TypeScript pueda comprobar
 * `api/index.ts` sin necesidad de haber compilado antes.
 */
declare const app: Hono;
export default app;
