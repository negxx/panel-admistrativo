import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Adaptador de Vercel.
 *
 * Reproduce la particularidad que rompió el despliegue: **Vercel consume el
 * cuerpo del request antes de llamar a la función** y lo entrega ya parseado en
 * `req.body`, dejando el stream vacío. Los adaptadores genéricos intentan leer
 * ese stream y se quedan esperando: los GET andaban y todos los POST se colgaban.
 *
 * Estos tests no usan la red ni la base: arman a mano el objeto que Vercel le
 * pasa a la función y verifican que la respuesta salga bien.
 */

const BUNDLE = join(import.meta.dirname, "../server-dist/app.mjs");

type Captured = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
};

/** Simula el `req` que arma Vercel: con `body` ya parseado y sin stream. */
function fakeRequest(options: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}): IncomingMessage {
  return {
    method: options.method,
    url: options.url,
    headers: {
      host: "club.vercel.app",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      ...options.headers,
    },
    body: options.body,
    // A propósito no hay stream legible: si el adaptador intentara leerlo,
    // se colgaría, que es justo el bug que estamos previniendo.
  } as unknown as IncomingMessage;
}

function fakeResponse(): { res: ServerResponse; captured: Captured; done: Promise<void> } {
  const captured: Captured = { statusCode: 0, headers: {}, body: "" };
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));

  const res = {
    set statusCode(value: number) {
      captured.statusCode = value;
    },
    get statusCode() {
      return captured.statusCode;
    },
    setHeader(name: string, value: string | string[]) {
      captured.headers[name.toLowerCase()] = value;
    },
    end(chunk?: Buffer | string) {
      captured.body = chunk ? chunk.toString() : "";
      resolve();
    },
  } as unknown as ServerResponse;

  return { res, captured, done };
}

let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;

beforeAll(async () => {
  if (!existsSync(BUNDLE)) {
    throw new Error(
      "Falta server-dist/app.mjs. Generalo con: npm run build:server",
    );
  }
  process.env.APP_SECRET = "x".repeat(40);
  process.env.DATABASE_URL = "postgresql://u:p@host.pooler.supabase.com:6543/postgres";

  handler = (await import("../api/index")).default as typeof handler;
});

describe("adaptador de Vercel", () => {
  it("responde un GET", async () => {
    const { res, captured, done } = fakeResponse();
    await handler(fakeRequest({ method: "GET", url: "/api/trpc/ping" }), res);
    await done;

    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body).result.data.json.ok).toBe(true);
  });

  it("responde un POST leyendo el cuerpo que ya parseó Vercel", async () => {
    // Éste es el caso que se colgaba en producción.
    const { res, captured, done } = fakeResponse();
    await handler(
      fakeRequest({
        method: "POST",
        url: "/api/trpc/auth.logout",
        body: { json: {} },
      }),
      res,
    );
    await done;

    // Sin sesión tiene que rechazar, pero lo importante es que **responda**.
    expect(captured.statusCode).toBe(401);
    expect(captured.body).toContain("UNAUTHORIZED");
  });

  it("acepta el cuerpo como texto además de como objeto", async () => {
    const { res, captured, done } = fakeResponse();
    await handler(
      fakeRequest({
        method: "POST",
        url: "/api/trpc/auth.logout",
        body: JSON.stringify({ json: {} }),
      }),
      res,
    );
    await done;

    expect(captured.statusCode).toBe(401);
  });

  it("devuelve 404 en rutas de API inexistentes", async () => {
    const { res, captured, done } = fakeResponse();
    await handler(fakeRequest({ method: "GET", url: "/api/nada" }), res);
    await done;

    expect(captured.statusCode).toBe(404);
  });
});
