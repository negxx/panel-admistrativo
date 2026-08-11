import { handle } from "hono/vercel";
import app from "../server/boot";

/**
 * Punto de entrada de Vercel.
 *
 * Vercel convierte en función serverless **cada archivo dentro de `api/`**. Por
 * eso el backend vive en `server/` y acá queda un único archivo: si el código
 * del servidor estuviera en `api/`, Vercel intentaría publicar cada router y
 * cada helper como un endpoint distinto.
 *
 * El `vercel.json` manda todo `/api/*` a esta función, que se lo pasa a Hono.
 */
export const config = {
  runtime: "nodejs",
};

export default handle(app);
