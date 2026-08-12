import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../server-dist/app.mjs";

/**
 * Punto de entrada de Vercel.
 *
 * El adaptador está escrito a mano por un motivo concreto: **Vercel consume el
 * cuerpo del request antes de llamar a la función** y lo deja ya parseado en
 * `req.body`. Los adaptadores genéricos (`@hono/node-server/vercel`) intentan
 * leer el stream original, que a esa altura está vacío, y se quedan esperando
 * datos que nunca llegan: los GET respondían bien y **todos los POST se colgaban**
 * hasta agotar el tiempo.
 *
 * Acá el cuerpo se reconstruye desde `req.body`, que es lo que Vercel realmente
 * entrega.
 *
 * El servidor se importa ya empaquetado en un único archivo
 * (`server-dist/app.mjs`, que genera `npm run build:server`): Vercel no incluye
 * la carpeta `server/` en el paquete de la función, y al ser un proyecto ESM los
 * imports sin extensión tampoco resolverían.
 */

type VercelRequest = IncomingMessage & { body?: unknown };

/** Reconstruye el cuerpo tal como lo dejó Vercel. */
function readBody(req: VercelRequest): string | Buffer | undefined {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const body = req.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body;

  // Vercel parsea el JSON a objeto: hay que volver a serializarlo.
  return JSON.stringify(body);
}

function buildUrl(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}${req.url ?? "/"}`;
}

function buildHeaders(req: VercelRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    // Algunas cabeceras llegan repetidas y Node las agrupa en un array.
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  return headers;
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const response = await app.fetch(
    new Request(buildUrl(req), {
      method: req.method,
      headers: buildHeaders(req),
      body: readBody(req),
    }),
  );

  res.statusCode = response.status;

  // `set-cookie` puede venir repetida (sesión del panel y del portal) y hay que
  // mandarla como lista, no concatenada.
  const setCookie = response.headers.getSetCookie();
  if (setCookie.length > 0) res.setHeader("set-cookie", setCookie);

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
  });

  res.end(Buffer.from(await response.arrayBuffer()));
}
