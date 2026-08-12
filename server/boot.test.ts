import { describe, expect, it } from "vitest";

/**
 * Arranque en un entorno mínimo.
 *
 * Reproduce lo que pasó en el primer despliegue a Vercel: sólo estaban cargadas
 * `DATABASE_URL`, `APP_SECRET` y `CRON_SECRET`, y el servidor se caía al
 * importar porque `env.ts` exigía además las tres variables del OAuth de Kimi.
 * Resultado: 500 en todos los endpoints.
 *
 * Este test falla si alguien vuelve a marcar como obligatoria una variable que
 * en realidad es opcional.
 */
describe("arranque con la configuración mínima", () => {
  it("levanta sin las variables del OAuth de Kimi", async () => {
    process.env.NODE_ENV = "production";
    // dotenv no pisa variables ya definidas: vacías equivale a que no existan.
    for (const key of ["APP_ID", "KIMI_AUTH_URL", "KIMI_OPEN_URL", "OWNER_UNION_ID"]) {
      process.env[key] = "";
    }
    process.env.DATABASE_URL = "postgresql://u:p@host.pooler.supabase.com:6543/postgres";
    process.env.APP_SECRET = "x".repeat(40);

    const app = (await import("./boot")).default;
    expect(app).toBeDefined();

    // Y responde: el ping no toca la base, así que alcanza para probar que la
    // función arrancó bien.
    const response = await app.fetch(new Request("http://localhost/api/trpc/ping"));
    expect(response.status).toBe(200);
  });

  it("avisa claro si falta una variable que sí es obligatoria", async () => {
    const original = process.env.APP_SECRET;
    process.env.APP_SECRET = "";
    try {
      await expect(import("./lib/env?fresh=" + Date.now())).rejects.toThrow(/APP_SECRET/);
    } finally {
      process.env.APP_SECRET = original;
    }
  });
});
