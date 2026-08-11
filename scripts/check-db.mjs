/**
 * Verifica que las cadenas de conexión estén bien y que la base responda.
 *
 *     npm run db:check
 *
 * Nunca imprime la contraseña: los mensajes de error de las librerías sí la
 * muestran, y así terminan copiadas en un chat o en un ticket. Acá se enmascara
 * siempre antes de mostrar nada.
 */
import "dotenv/config";
import postgres from "postgres";

/** Reemplaza la contraseña por asteriscos en cualquier texto. */
function redact(text) {
  return String(text).replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]*@/g, "$1****@");
}

/**
 * Revisa la forma de la URL antes de intentar conectar, y explica en castellano
 * qué está mal. Los errores de las librerías ("Invalid URL") no ayudan a nadie.
 */
function validate(name, url) {
  if (!url) return `${name}: falta en el .env`;
  if (url.includes("TU_PASSWORD")) return `${name}: falta reemplazar TU_PASSWORD`;
  if (url.includes("[YOUR-PASSWORD]")) return `${name}: falta reemplazar [YOUR-PASSWORD]`;
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    return `${name}: no arranca con postgresql:// (¿copiaste la clave de la API en vez de la cadena de conexión?)`;
  }
  if (!url.includes("@")) {
    return (
      `${name}: falta el "@" que separa la contraseña del servidor.\n` +
      `   Es el error más común: al pegar la contraseña se borra el "@" y lo que sigue.\n` +
      `   La forma correcta es:  postgresql://USUARIO:CONTRASEÑA@SERVIDOR:PUERTO/postgres`
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `${name}: la URL está mal formada. Si la contraseña tiene @ # / : ? hay que escaparlos (o resetearla y usar sólo letras y números).`;
  }

  if (!parsed.hostname.includes("supabase")) {
    return `${name}: el servidor "${parsed.hostname}" no parece de Supabase.`;
  }
  return null;
}

const EXPECTED_PORT = { DATABASE_URL: "6543", DIRECT_URL: "5432" };

let hasErrors = false;

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = process.env[name];
  const problem = validate(name, url);

  if (problem) {
    console.log(`✗ ${problem}\n`);
    hasErrors = true;
    continue;
  }

  const parsed = new URL(url);
  const port = parsed.port || "5432";
  console.log(`✓ ${name}: formato correcto`);
  console.log(`   servidor: ${parsed.hostname}:${port}`);

  if (port !== EXPECTED_PORT[name]) {
    console.log(
      `   ⚠ se esperaba el puerto ${EXPECTED_PORT[name]}. ` +
        (name === "DATABASE_URL"
          ? "La app necesita el pooler en modo transacción (6543)."
          : "Las migraciones necesitan el pooler en modo sesión (5432)."),
    );
  }
  if (url.includes("pgbouncer=true")) {
    console.log(`   ⚠ sacá "?pgbouncer=true": es un flag de Prisma, acá el driver es postgres-js.`);
  }
  console.log();
}

if (hasErrors) {
  console.log("Corregí el .env y volvé a correr: npm run db:check");
  process.exit(1);
}

// ── Conexión real ────────────────────────────────────────────────────────────
console.log("Probando la conexión…\n");

const sql = postgres(process.env.DIRECT_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
});

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log("✓ Conecta correctamente.\n");

  if (tables.length === 0) {
    console.log("La base está vacía: todavía no se aplicaron las migraciones.");
    console.log("Corré:  npm run db:migrate");
  } else {
    console.log(`Tablas creadas (${tables.length}):`);
    for (const t of tables) console.log(`  · ${t.table_name}`);

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM players`.catch(() => [
      { count: null },
    ]);
    if (count !== null) {
      console.log(
        `\nSocios cargados: ${count}` +
          (count === 0 ? "  →  ahora podés correr: npm run db:import" : ""),
      );
    }
  }
} catch (error) {
  // El mensaje de la librería puede incluir la cadena completa: se enmascara.
  console.log("✗ No se pudo conectar.\n");
  console.log("  ", redact(error.message));

  const code = error.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    console.log("\n   El servidor no existe o no hay internet. Revisá el nombre del host.");
  } else if (code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    console.log("\n   No responde. Si el proyecto de Supabase estaba pausado, puede tardar");
    console.log("   un minuto en despertar: esperá y probá de nuevo.");
  } else if (/password|authentication/i.test(error.message)) {
    console.log("\n   La contraseña no coincide. Reseteala en Supabase:");
    console.log("   Settings → Database → Reset database password");
  }
  process.exitCode = 1;
} finally {
  await sql.end();
}
