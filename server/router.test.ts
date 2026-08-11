import { beforeAll, describe, expect, it } from "vitest";

/**
 * Smoke test de la API por HTTP real.
 *
 * Levanta la app de Hono en memoria y le pega con `fetch`, igual que el
 * navegador. Sirve para dos cosas:
 *
 *  1. Comprobar que el servidor arranca y responde (que el cableado de tRPC,
 *     el contexto y la base están bien enchufados).
 *  2. **Verificar que los endpoints están protegidos.** Antes casi todos eran
 *     públicos: sin sesión se podía listar socios, cobrar y borrar datos. Este
 *     test falla si alguno vuelve a quedar abierto.
 */

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  process.env.APP_SECRET = "secreto-de-prueba-para-los-tests-1234567890";
  process.env.APP_ID = "test";
  process.env.KIMI_AUTH_URL = "http://localhost:3000";
  process.env.KIMI_OPEN_URL = "http://localhost:3000";

  // Se inyecta una base PGlite en memoria antes de levantar la app, así el test
  // no necesita credenciales de Supabase ni toca la base real del club.
  const { createTestDb } = await import("./domain/test-db");
  const { setDb } = await import("./queries/connection");
  setDb(await createTestDb());

  app = (await import("./boot")).default;
}, 60_000);

/** Llama a un procedimiento tRPC de tipo query, sin cookies. */
async function callQuery(path: string) {
  return app.fetch(new Request(`http://localhost/api/trpc/${path}`, { method: "GET" }));
}

/** Llama a un procedimiento tRPC de tipo mutation, sin cookies. */
async function callMutation(path: string, input: unknown = {}) {
  return app.fetch(
    new Request(`http://localhost/api/trpc/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: input }),
    }),
  );
}

/**
 * Código de error de tRPC. Con superjson la respuesta viene envuelta en `json`:
 * `{ error: { json: { data: { code } } } }`.
 */
async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as {
    error?: { json?: { data?: { code?: string } } };
  };
  return body.error?.json?.data?.code;
}

describe("la API arranca y responde", () => {
  it("responde el ping público", async () => {
    const response = await callQuery("ping");
    expect(response.status).toBe(200);

    const body = (await response.json()) as { result?: { data?: { json?: { ok?: boolean } } } };
    expect(body.result?.data?.json?.ok).toBe(true);
  });

  it("devuelve 404 en rutas de API que no existen", async () => {
    const response = await app.fetch(new Request("http://localhost/api/nada", { method: "GET" }));
    expect(response.status).toBe(404);
  });
});

describe("endpoints del panel: rechazan a los anónimos", () => {
  // Cada uno de estos era `publicQuery` en la versión anterior.
  const protectedQueries = [
    "auth.me",
    "player.list",
    "guardian.list",
    "quota.list",
    "payment.list",
    "payment.pendingReview",
    "transaction.list",
    "alert.getDebtors",
    "dashboard.getSummary",
    "closure.list",
    "category.list",
    "users.list",
  ];

  it.each(protectedQueries)("%s exige sesión", async (path) => {
    const response = await callQuery(path);
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });

  const protectedMutations = [
    "player.create",
    "player.delete",
    "guardian.create",
    "quota.generateMonthly",
    "quota.updateStatus",
    "payment.register",
    "payment.confirm",
    "transaction.create",
    "closure.open",
    "category.create",
    "users.create",
  ];

  it.each(protectedMutations)("%s exige sesión", async (path) => {
    const response = await callMutation(path);
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });
});

describe("endpoints del portal de socios", () => {
  it("el tablero del socio exige haber ingresado con DNI y PIN", async () => {
    expect(await errorCode(await callQuery("portal.dashboard"))).toBe("UNAUTHORIZED");
  });

  it("informar un pago exige sesión del portal", async () => {
    const response = await callMutation("portal.reportPayment", {
      quotaIds: [1],
      paymentMethod: "transfer",
    });
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });

  it("los datos bancarios sí son públicos: el socio los necesita para pagar", async () => {
    const response = await callQuery("portal.bankInfo");
    expect(response.status).toBe(200);
  });
});

describe("login del panel", () => {
  it("rechaza credenciales inválidas sin decir si el usuario existe", async () => {
    const response = await callMutation("auth.loginLocal", {
      username: "noexiste",
      password: "loquesea",
    });
    expect(response.status).toBe(401);

    const body = (await response.json()) as {
      error?: { json?: { message?: string; data?: { code?: string } } };
    };
    expect(body.error?.json?.data?.code).toBe("UNAUTHORIZED");
    // Mensaje genérico a propósito: no confirmamos qué usuarios existen.
    expect(body.error?.json?.message).toBe("Usuario o contraseña incorrectos");
  });
});
