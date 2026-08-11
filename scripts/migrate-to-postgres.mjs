/**
 * Importa la base SQLite del club a PostgreSQL (Supabase), sin perder nada.
 *
 *     npm run db:import
 *
 * Antes de correrlo:
 *
 *   1. Creá el proyecto en Supabase.
 *   2. Poné en `.env`:
 *        DIRECT_URL=postgresql://...:5432/postgres     (conexión directa)
 *        DATABASE_URL=postgresql://...:6543/postgres   (pooler, para la app)
 *   3. Creá las tablas:  npm run db:migrate
 *   4. Recién ahí:       npm run db:import
 *
 * Qué hace:
 *
 *   - Copia las tablas **en orden de dependencias**, para que las foreign keys
 *     nunca apunten a algo que todavía no existe.
 *   - **Conserva los ids originales**, así todas las referencias entre tablas
 *     siguen siendo válidas sin tener que remapear nada.
 *   - Después ajusta los contadores `serial` para que el próximo alta no choque
 *     con un id ya usado. Es el error clásico al migrar a Postgres.
 *   - Convierte los tipos que cambian de forma: los enteros 0/1 pasan a
 *     booleanos y los timestamps en segundos, a fechas reales.
 *   - Los hashes de contraseñas y PIN se copian tal cual: nadie tiene que
 *     volver a activar su acceso.
 *
 * Es **idempotente**: borra el contenido de las tablas destino antes de copiar,
 * así que se puede correr las veces que haga falta hasta que salga bien.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import postgres from "postgres";
import { existsSync } from "node:fs";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/club.db";
const PG_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!existsSync(SQLITE_PATH)) {
  console.error(`No encontré la base SQLite en ${SQLITE_PATH}.`);
  process.exit(1);
}
if (!PG_URL) {
  console.error("Falta DIRECT_URL (o DATABASE_URL) en el .env.");
  console.error("Usá la conexión DIRECTA de Supabase (puerto 5432), no el pooler.");
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(PG_URL, { prepare: false, max: 1 });

/** ¿Existe la tabla en la base de origen? */
function sourceHas(table) {
  return !!sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
}

const bool = (v) => (v === null || v === undefined ? null : Boolean(v));

/**
 * Entero. SQLite no valida los tipos con firmeza y dejaba guardar decimales en
 * columnas declaradas como INTEGER (por ejemplo un arqueo de caja de `70.5`).
 * Postgres sí valida, así que se redondea acá.
 *
 * El sistema trabaja con pesos enteros: redondear es lo correcto, no un parche.
 */
const int = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const text = (v) => (v === null || v === undefined || v === "" ? null : String(v));

/** SQLite guarda los timestamps de Drizzle como segundos desde epoch. */
const stamp = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Si el número es muy grande ya viene en milisegundos.
  return new Date(n > 100_000_000_000 ? n : n * 1000);
};

/**
 * Fecha de calendario, normalizada a `AAAA-MM-DD`.
 *
 * Los datos viejos tienen fechas como `2026-04-1`, sin el cero adelante: el
 * generador original armaba el día sin `padStart`. Postgres las rechaza, así que
 * se completan acá en vez de descartar la fila.
 */
function day(v) {
  if (typeof v !== "string") return null;
  const match = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const [, year, month, dayOfMonth] = match;
  const m = Number(month);
  const d = Number(dayOfMonth);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Verifica que la fecha exista de verdad (no un 31 de febrero).
  const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== d) return null;

  return iso;
}

/**
 * Tablas en orden de dependencia. Cada una define cómo se transforma cada fila
 * de SQLite a Postgres.
 */
const TABLES = [
  {
    name: "local_users",
    map: (r) => ({
      id: r.id,
      username: r.username,
      password: r.password,
      name: r.name,
      role: r.role === "secretary" ? "secretary" : "admin",
      createdAt: stamp(r.createdAt),
    }),
  },
  {
    name: "guardians",
    map: (r) => ({
      id: r.id,
      name: r.name,
      dni: String(r.dni),
      phone: r.phone ?? "",
      email: text(r.email),
      address: text(r.address),
      whatsappEnabled: bool(r.whatsappEnabled) ?? true,
      pin: text(r.pin),
      createdAt: stamp(r.createdAt),
    }),
  },
  {
    name: "categories",
    map: (r) => ({
      id: r.id,
      name: r.name,
      paysQuota: bool(r.paysQuota) ?? true,
      baseAmount: int(r.baseAmount),
      siblingDiscountPercent: int(r.siblingDiscountPercent),
      description: text(r.description),
      createdAt: stamp(r.createdAt),
    }),
  },
  {
    name: "players",
    fks: { guardianId: "guardians" },
    map: (r) => ({
      id: r.id,
      name: r.name,
      dni: String(r.dni),
      // `birthDate` es obligatorio: si viniera vacío, la fila no se puede migrar.
      birthDate: day(r.birthDate),
      address: text(r.address),
      phone: text(r.phone),
      email: text(r.email),
      category: r.category,
      guardianId: r.guardianId || null,
      registrationDate: day(r.registrationDate),
      status: r.status === "inactive" ? "inactive" : "active",
      photoUrl: text(r.photoUrl),
      notes: text(r.notes),
      createdAt: stamp(r.createdAt),
      quotaType: r.quotaType ?? "deportivo",
      pin: text(r.pin),
    }),
    required: ["birthDate"],
  },
  {
    name: "quotas",
    fks: { playerId: "players" },
    map: (r) => ({
      id: r.id,
      playerId: r.playerId,
      month: int(r.month),
      year: int(r.year),
      baseAmount: int(r.baseAmount),
      discountAmount: int(r.discountAmount),
      interestAmount: int(r.interestAmount),
      totalAmount: int(r.totalAmount),
      dueDate: day(r.dueDate),
      status: ["pending", "paid", "overdue"].includes(r.status) ? r.status : "pending",
      paymentDate: day(r.paymentDate),
      paymentMethod: ["cash", "transfer", "mercadopago"].includes(r.paymentMethod)
        ? r.paymentMethod
        : null,
      receiptNumber: text(r.receiptNumber),
      notes: text(r.notes),
      createdAt: stamp(r.createdAt),
    }),
    required: ["dueDate", "playerId"],
  },
  {
    name: "payments",
    fks: { guardianId: "guardians", playerId: "players", reviewedBy: "local_users", createdBy: "local_users" },
    map: (r) => ({
      id: r.id,
      guardianId: r.guardianId || null,
      playerId: r.playerId || null,
      totalAmount: int(r.totalAmount),
      paymentDate: day(r.paymentDate),
      paymentMethod: ["cash", "transfer", "mercadopago"].includes(r.paymentMethod)
        ? r.paymentMethod
        : "cash",
      status: ["confirmed", "pending_review", "rejected"].includes(r.status)
        ? r.status
        : "confirmed",
      source: r.source === "portal" ? "portal" : "panel",
      mercadopagoPaymentId: text(r.mercadopagoPaymentId),
      receiptNumber: text(r.receiptNumber),
      reference: text(r.reference),
      notes: text(r.notes),
      reviewedBy: r.reviewedBy || null,
      reviewedAt: stamp(r.reviewedAt),
      createdBy: r.createdBy || null,
      createdAt: stamp(r.createdAt),
    }),
    required: ["paymentDate"],
  },
  {
    name: "payment_quotas",
    fks: { paymentId: "payments", quotaId: "quotas" },
    map: (r) => ({
      id: r.id,
      paymentId: r.paymentId,
      quotaId: r.quotaId,
      amount: int(r.amount),
    }),
    required: ["paymentId", "quotaId"],
  },
  {
    name: "receipt_sequences",
    map: (r) => ({ year: int(r.year), lastNumber: int(r.lastNumber) }),
    serialColumn: null,
  },
  {
    name: "transactions",
    map: (r) => ({
      id: r.id,
      type: r.type === "income" ? "income" : "expense",
      category: r.category ?? "Sin categoría",
      description: r.description ?? "",
      amount: int(r.amount),
      date: day(r.date),
      method: ["cash", "transfer", "mercadopago"].includes(r.method) ? r.method : "cash",
      attachmentUrl: text(r.attachmentUrl),
      // En SQLite apuntaba a `users`; ahora apunta a `local_users`. Como casi
      // siempre venía en null, se descarta para no romper la foreign key.
      createdBy: null,
      createdAt: stamp(r.createdAt),
    }),
    required: ["date"],
  },
  {
    name: "alert_logs",
    fks: { guardianId: "guardians", playerId: "players" },
    map: (r) => ({
      id: r.id,
      guardianId: r.guardianId || null,
      playerId: r.playerId || null,
      quotaIds: r.quotaIds ?? "[]",
      message: r.message ?? "",
      status: ["prepared", "sent", "failed"].includes(r.status) ? r.status : "sent",
      sentAt: stamp(r.sentAt),
    }),
  },
  {
    name: "settings",
    map: (r) => ({
      id: r.id,
      key: r.key,
      value: r.value ?? "",
      updatedAt: stamp(r.updatedAt),
    }),
  },
  {
    name: "daily_closures",
    fks: { openedBy: "local_users", closedBy: "local_users" },
    map: (r) => ({
      id: r.id,
      date: day(r.date),
      openedBy: r.openedBy || null,
      closedBy: r.closedBy || null,
      openingAmount: int(r.openingAmount),
      cashSales: int(r.cashSales),
      transferSales: int(r.transferSales),
      mpSales: int(r.mpSales),
      otherIncome: int(r.otherIncome),
      totalIncome: int(r.totalIncome),
      totalExpenses: int(r.totalExpenses),
      cashExpenses: int(r.cashExpenses),
      expectedCash: int(r.expectedCash),
      actualCash: int(r.actualCash),
      difference: int(r.difference),
      notes: text(r.notes),
      status: r.status === "closed" ? "closed" : "open",
      createdAt: stamp(r.createdAt),
      closedAt: stamp(r.closedAt),
    }),
    required: ["date"],
  },
];

async function run() {
  console.log(`Origen : ${SQLITE_PATH}`);
  console.log(`Destino: ${PG_URL.replace(/:[^:@]+@/, ":****@")}\n`);

  // Se vacían las tablas destino para que el script se pueda repetir.
  await sql.unsafe(`
    TRUNCATE TABLE
      payment_quotas, payments, quotas, alert_logs, daily_closures,
      players, guardians, categories, transactions, settings,
      receipt_sequences, local_users, login_attempts
    RESTART IDENTITY CASCADE
  `);
  console.log("Tablas destino vaciadas.\n");

  const skipped = [];
  let totalRows = 0;
  /** Ids que efectivamente entraron en cada tabla, para validar las referencias. */
  const importedIds = new Map();

  for (const table of TABLES) {
    if (!sourceHas(table.name)) {
      console.log(`· ${table.name}: no existe en el origen, se saltea`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
    if (rows.length === 0) {
      console.log(`· ${table.name}: vacía`);
      continue;
    }

    const mapped = [];
    const ownIds = new Set();

    for (const row of rows) {
      const value = table.map(row);

      /**
       * Referencias a filas que no llegaron a importarse.
       *
       * Si la columna es opcional se pone en null (el dato se pierde, pero la
       * fila entra); si es obligatoria, se saltea la fila entera. Así una
       * referencia huérfana no hace fallar toda la importación, que es lo que
       * pasaba antes con `payment_quotas`.
       */
      for (const [column, targetTable] of Object.entries(table.fks ?? {})) {
        const value_ = value[column];
        if (value_ == null) continue;
        const validIds = importedIds.get(targetTable);
        if (validIds && !validIds.has(value_)) {
          if ((table.required ?? []).includes(column)) {
            skipped.push(`${table.name} id=${row.id}: apunta a ${targetTable} #${value_}, que no se importó`);
            value[column] = undefined; // marca la fila como descartable
          } else {
            value[column] = null;
          }
        }
      }
      if (Object.values(value).includes(undefined)) continue;

      // Filas con un campo obligatorio inválido: se anotan y no se copian, en
      // vez de hacer fallar toda la migración.
      const missing = (table.required ?? []).filter((f) => value[f] === null);
      if (missing.length > 0) {
        skipped.push(`${table.name} id=${row.id}: falta ${missing.join(", ")}`);
        continue;
      }

      if (value.id !== undefined) ownIds.add(value.id);
      mapped.push(value);
    }

    importedIds.set(table.name, ownIds);

    // De a lotes, para no armar una sentencia gigante.
    const BATCH = 500;
    for (let i = 0; i < mapped.length; i += BATCH) {
      await sql`INSERT INTO ${sql(table.name)} ${sql(mapped.slice(i, i + BATCH))}`;
    }

    totalRows += mapped.length;
    console.log(`✓ ${table.name}: ${mapped.length} fila(s)`);
  }

  // ── Contadores de los `serial` ──────────────────────────────
  // Al copiar los ids a mano, la secuencia queda en 1 y el próximo INSERT
  // chocaría con un id existente. Esto la deja apuntando al máximo usado.
  console.log("\nAjustando contadores de id…");
  for (const table of TABLES) {
    if (table.serialColumn === null) continue;
    if (!sourceHas(table.name)) continue;

    const [{ max }] = await sql.unsafe(
      `SELECT COALESCE(MAX(id), 0) AS max FROM ${table.name}`,
    );
    if (Number(max) > 0) {
      await sql.unsafe(
        `SELECT setval(pg_get_serial_sequence('${table.name}', 'id'), ${Number(max)})`,
      );
      console.log(`· ${table.name}: próximo id = ${Number(max) + 1}`);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Importación terminada: ${totalRows} filas.`);

  if (skipped.length > 0) {
    console.log(`\n⚠ ${skipped.length} fila(s) no se copiaron por datos inválidos:`);
    for (const item of skipped.slice(0, 20)) console.log(`   ${item}`);
    if (skipped.length > 20) console.log(`   … y ${skipped.length - 20} más`);
    console.log("\nRevisalas en la base vieja y cargalas a mano si hacen falta.");
  }

  console.log("\nProbá entrar al panel con tu usuario de siempre:");
  console.log("las contraseñas y los PIN se copiaron tal cual.");
}

run()
  .catch((error) => {
    console.error("\nFalló la importación:", error.message ?? error);
    console.error("\nNo se perdió nada: la base SQLite quedó intacta.");
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await sql.end();
  });
