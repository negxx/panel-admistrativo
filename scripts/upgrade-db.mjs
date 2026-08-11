/**
 * Actualiza una base `club.db` existente al esquema nuevo, sin perder datos.
 *
 *     npm run db:upgrade
 *
 * Es **idempotente**: se puede correr las veces que haga falta. Cada paso
 * verifica primero si ya está aplicado.
 *
 * Qué hace, en orden:
 *
 *   0. Saca una copia de seguridad de la base antes de tocar nada.
 *   1. Agrega las columnas y tablas nuevas.
 *   2. Crea los índices (incluido el de recibos únicos).
 *   3. Vuelca `quota_configs` dentro de `categories` y borra la tabla vieja.
 *   4. Hashea las contraseñas y los PIN que estaban en texto plano.
 *   5. Inicializa el contador de recibos con la numeración ya existente.
 *   6. Repara los pagos que quedaron en $0 por el bug del `IN (...)`.
 *   7. Recalcula el estado y el interés de las cuotas impagas.
 */
import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "node:crypto";
import { copyFileSync, existsSync } from "node:fs";

const DB_PATH = process.env.SQLITE_PATH ?? "./data/club.db";

if (!existsSync(DB_PATH)) {
  console.error(`No encontré la base en ${DB_PATH}.`);
  console.error("Si es una instalación nueva, corré: npm run db:push && npm run db:seed");
  process.exit(1);
}

// ── 0. Copia de seguridad ───────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = `${DB_PATH}.backup-${stamp}`;
copyFileSync(DB_PATH, backupPath);
console.log(`Copia de seguridad: ${backupPath}\n`);

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF"); // se reactivan al final

const log = (msg) => console.log(`  ${msg}`);

/** ¿Existe la tabla? */
function tableExists(name) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
}

/** ¿Existe la columna en esa tabla? */
function columnExists(table, column) {
  if (!tableExists(table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/** Agrega una columna sólo si falta. */
function addColumn(table, column, definition) {
  if (columnExists(table, column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  log(`+ ${table}.${column}`);
}

function hash(plain) {
  const cost = 32768;
  const salt = randomBytes(16);
  return `scrypt$${cost}$${salt.toString("hex")}$${scryptSync(plain, salt, 64, { N: cost, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}

const isHashed = (value) => typeof value === "string" && value.startsWith("scrypt$");

// ── 1. Columnas y tablas nuevas ─────────────────────────────────────────────
console.log("1. Estructura");

addColumn("categories", "siblingDiscountPercent", "INTEGER NOT NULL DEFAULT 0");

addColumn("payments", "playerId", "INTEGER REFERENCES players(id)");
addColumn("payments", "status", "TEXT NOT NULL DEFAULT 'confirmed'");
addColumn("payments", "source", "TEXT NOT NULL DEFAULT 'panel'");
addColumn("payments", "reference", "TEXT");
addColumn("payments", "reviewedBy", "INTEGER REFERENCES local_users(id)");
addColumn("payments", "reviewedAt", "INTEGER");
addColumn("payments", "createdBy", "INTEGER REFERENCES local_users(id)");

addColumn("payment_quotas", "amount", "INTEGER NOT NULL DEFAULT 0");

addColumn("quotas", "receiptNumber", "TEXT");

addColumn("transactions", "method", "TEXT NOT NULL DEFAULT 'cash'");

addColumn("alert_logs", "playerId", "INTEGER REFERENCES players(id)");

addColumn("daily_closures", "otherIncome", "INTEGER NOT NULL DEFAULT 0");
addColumn("daily_closures", "cashExpenses", "INTEGER NOT NULL DEFAULT 0");

if (!tableExists("receipt_sequences")) {
  db.prepare(`
    CREATE TABLE receipt_sequences (
      year INTEGER PRIMARY KEY,
      lastNumber INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  log("+ tabla receipt_sequences");
}

// ── 2. Índices ──────────────────────────────────────────────────────────────
console.log("\n2. Índices");

const indexes = [
  ["guardians_name_idx", "CREATE INDEX IF NOT EXISTS guardians_name_idx ON guardians(name)"],
  ["players_guardian_idx", "CREATE INDEX IF NOT EXISTS players_guardian_idx ON players(guardianId)"],
  ["players_category_idx", "CREATE INDEX IF NOT EXISTS players_category_idx ON players(category)"],
  ["players_status_idx", "CREATE INDEX IF NOT EXISTS players_status_idx ON players(status)"],
  ["players_name_idx", "CREATE INDEX IF NOT EXISTS players_name_idx ON players(name)"],
  ["quotas_status_idx", "CREATE INDEX IF NOT EXISTS quotas_status_idx ON quotas(status)"],
  ["quotas_due_date_idx", "CREATE INDEX IF NOT EXISTS quotas_due_date_idx ON quotas(dueDate)"],
  ["payments_date_idx", "CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(paymentDate)"],
  ["payments_guardian_idx", "CREATE INDEX IF NOT EXISTS payments_guardian_idx ON payments(guardianId)"],
  ["payments_player_idx", "CREATE INDEX IF NOT EXISTS payments_player_idx ON payments(playerId)"],
  ["payments_status_idx", "CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status)"],
  ["payment_quotas_quota_idx", "CREATE INDEX IF NOT EXISTS payment_quotas_quota_idx ON payment_quotas(quotaId)"],
  ["transactions_date_idx", "CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date)"],
  ["transactions_type_idx", "CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type)"],
  ["alert_logs_guardian_idx", "CREATE INDEX IF NOT EXISTS alert_logs_guardian_idx ON alert_logs(guardianId)"],
  ["alert_logs_sent_at_idx", "CREATE INDEX IF NOT EXISTS alert_logs_sent_at_idx ON alert_logs(sentAt)"],
  ["daily_closures_status_idx", "CREATE INDEX IF NOT EXISTS daily_closures_status_idx ON daily_closures(status)"],
];

for (const [name, sql] of indexes) {
  db.prepare(sql).run();
  log(`· ${name}`);
}

/**
 * Índices únicos: pueden fallar si los datos ya tienen duplicados. En ese caso
 * se avisa en vez de romper, así el resto de la actualización igual se aplica.
 */
const uniqueIndexes = [
  [
    "quotas_player_period_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS quotas_player_period_idx ON quotas(playerId, year, month)",
    "Hay socios con más de una cuota para el mismo mes. Unificalas y volvé a correr el script.",
  ],
  [
    "payments_receipt_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_idx ON payments(receiptNumber)",
    "Hay números de recibo repetidos (el bug viejo de numeración). Corregilos y volvé a correr el script.",
  ],
  [
    "payment_quotas_pair_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS payment_quotas_pair_idx ON payment_quotas(paymentId, quotaId)",
    "Hay cuotas vinculadas dos veces al mismo pago.",
  ],
  [
    "daily_closures_date_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS daily_closures_date_idx ON daily_closures(date)",
    "Hay más de un cierre de caja para la misma fecha.",
  ],
  [
    "categories_name_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS categories_name_idx ON categories(name)",
    "Hay categorías con el mismo nombre.",
  ],
];

const warnings = [];
for (const [name, sql, warning] of uniqueIndexes) {
  try {
    db.prepare(sql).run();
    log(`· ${name} (único)`);
  } catch {
    warnings.push(`${name}: ${warning}`);
    log(`! ${name} — no se pudo crear`);
  }
}

// ── 3. quota_configs → categories ───────────────────────────────────────────
console.log("\n3. Unificación de categorías");

if (tableExists("quota_configs")) {
  const configs = db.prepare("SELECT category, baseAmount, siblingDiscountPercent FROM quota_configs").all();
  const upsert = db.transaction((rows) => {
    for (const row of rows) {
      const existing = db.prepare("SELECT id, baseAmount FROM categories WHERE name = ?").get(row.category);
      if (existing) {
        // Si la categoría ya existe pero sin monto, se completa con el de quota_configs.
        if (!existing.baseAmount) {
          db.prepare("UPDATE categories SET baseAmount = ?, siblingDiscountPercent = ? WHERE id = ?").run(
            row.baseAmount,
            row.siblingDiscountPercent ?? 0,
            existing.id,
          );
          log(`~ ${row.category}: monto completado desde quota_configs`);
        }
      } else {
        db.prepare(
          "INSERT INTO categories (name, paysQuota, baseAmount, siblingDiscountPercent) VALUES (?, 1, ?, ?)",
        ).run(row.category, row.baseAmount, row.siblingDiscountPercent ?? 0);
        log(`+ categoría ${row.category} (${row.baseAmount})`);
      }
    }
  });
  upsert(configs);

  db.prepare("DROP TABLE quota_configs").run();
  log("- tabla quota_configs eliminada");
} else {
  log("· quota_configs ya no existe");
}

// Categorías que usan los socios pero no están cargadas: se crean en 0 y sin
// cobro, para que aparezcan en pantalla y alguien les ponga el precio real.
const missing = db
  .prepare(`
    SELECT DISTINCT category FROM players
    WHERE status = 'active' AND category NOT IN (SELECT name FROM categories)
  `)
  .all();

for (const row of missing) {
  db.prepare(
    "INSERT INTO categories (name, paysQuota, baseAmount, siblingDiscountPercent, description) VALUES (?, 0, 0, 0, ?)",
  ).run(row.category, "Creada automáticamente en la migración: falta definir el monto");
  log(`+ categoría "${row.category}" creada sin monto — REVISAR`);
}

// ── 4. Hasheo de secretos ───────────────────────────────────────────────────
console.log("\n4. Contraseñas y PIN");

let hashedPasswords = 0;
for (const user of db.prepare("SELECT id, password FROM local_users").all()) {
  if (isHashed(user.password)) continue;
  db.prepare("UPDATE local_users SET password = ? WHERE id = ?").run(hash(user.password), user.id);
  hashedPasswords++;
}
log(`${hashedPasswords} contraseña(s) hasheada(s)`);

let hashedPins = 0;
for (const table of ["guardians", "players"]) {
  for (const row of db.prepare(`SELECT id, pin FROM ${table} WHERE pin IS NOT NULL AND pin <> ''`).all()) {
    if (isHashed(row.pin)) continue;
    db.prepare(`UPDATE ${table} SET pin = ? WHERE id = ?`).run(hash(row.pin), row.id);
    hashedPins++;
  }
}
log(`${hashedPins} PIN hasheado(s)`);

// ── 5. Contador de recibos ──────────────────────────────────────────────────
console.log("\n5. Numeración de recibos");

const receipts = db
  .prepare(`
    SELECT CAST(substr(receiptNumber, 3, 4) AS INTEGER) AS year,
           MAX(CAST(substr(receiptNumber, 8) AS INTEGER)) AS last
    FROM payments
    WHERE receiptNumber LIKE 'R-____-%'
    GROUP BY year
  `)
  .all();

for (const row of receipts) {
  db.prepare(`
    INSERT INTO receipt_sequences (year, lastNumber) VALUES (?, ?)
    ON CONFLICT(year) DO UPDATE SET lastNumber = MAX(lastNumber, excluded.lastNumber)
  `).run(row.year, row.last ?? 0);
  log(`${row.year}: siguiente recibo será el ${(row.last ?? 0) + 1}`);
}

// ── 6. Reparación de pagos en $0 ────────────────────────────────────────────
console.log("\n6. Pagos con importe incorrecto");

/**
 * El bug del `IN (${ids.join(",")})` hacía que, al pagar más de una cuota, el
 * importe se calculara sobre cero filas: el pago quedaba en $0 pero las cuotas
 * igual se marcaban como pagadas. Acá se recalcula el importe sumando las
 * cuotas realmente vinculadas al pago.
 */
const brokenPayments = db
  .prepare(`
    SELECT p.id,
           (SELECT COALESCE(SUM(q.totalAmount), 0)
            FROM payment_quotas pq
            JOIN quotas q ON q.id = pq.quotaId
            WHERE pq.paymentId = p.id) AS realTotal
    FROM payments p
    WHERE p.totalAmount = 0
  `)
  .all()
  .filter((p) => p.realTotal > 0);

for (const payment of brokenPayments) {
  db.prepare("UPDATE payments SET totalAmount = ? WHERE id = ?").run(payment.realTotal, payment.id);
  log(`pago #${payment.id}: $0 → $${payment.realTotal.toLocaleString("es-AR")}`);
}
if (brokenPayments.length === 0) log("· ninguno para corregir");

const stillZero = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE totalAmount = 0").get().n;
if (stillZero > 0) {
  warnings.push(
    `Quedan ${stillZero} pago(s) en $0 sin cuotas asociadas: no se pueden reconstruir solos, revisalos a mano.`,
  );
}

// Congela el importe de cada cuota en la tabla intermedia (columna nueva).
db.prepare(`
  UPDATE payment_quotas
  SET amount = COALESCE((SELECT q.totalAmount FROM quotas q WHERE q.id = payment_quotas.quotaId), 0)
  WHERE amount = 0
`).run();

// ── 7. Estado e intereses de las cuotas ─────────────────────────────────────
console.log("\n7. Vencimientos e intereses");

const settings = Object.fromEntries(
  db.prepare("SELECT key, value FROM settings").all().map((s) => [s.key, s.value]),
);
const interestRate = Number(settings.interestRate ?? 0.5);
const graceDays = Math.trunc(Number(settings.graceDays ?? 3));

const marked = db
  .prepare(`
    UPDATE quotas SET status = 'overdue'
    WHERE status = 'pending' AND dueDate < date('now', 'localtime', ?)
  `)
  .run(`-${graceDays} days`);
log(`${marked.changes} cuota(s) marcadas como vencidas`);

const updated = db
  .prepare(`
    UPDATE quotas
    SET interestAmount = CAST(ROUND(
          MAX(0, baseAmount - discountAmount) * ? / 100.0 *
          MAX(0, CAST(julianday('now','localtime') - julianday(dueDate) AS INTEGER) - ?)
        ) AS INTEGER),
        totalAmount = MAX(0, baseAmount - discountAmount) + CAST(ROUND(
          MAX(0, baseAmount - discountAmount) * ? / 100.0 *
          MAX(0, CAST(julianday('now','localtime') - julianday(dueDate) AS INTEGER) - ?)
        ) AS INTEGER)
    WHERE status = 'overdue'
  `)
  .run(interestRate, graceDays, interestRate, graceDays);
log(`${updated.changes} cuota(s) con interés recalculado`);

// Valores por defecto de la configuración nueva (datos bancarios, nombre).
const defaults = {
  clubName: "Club Atlético",
  bankName: "",
  bankCbu: "",
  bankAlias: "",
  bankHolder: "",
};
for (const [key, value] of Object.entries(defaults)) {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

db.pragma("foreign_keys = ON");
db.close();

console.log("\n─────────────────────────────────────────");
console.log("Actualización terminada.");

if (warnings.length > 0) {
  console.log("\nRevisá esto a mano:");
  for (const warning of warnings) console.log(`  ⚠ ${warning}`);
}

if (missing.length > 0) {
  console.log("\nCategorías creadas sin monto (entrá a Categorías y cargales el precio):");
  for (const row of missing) console.log(`  · ${row.category}`);
}

console.log(`\nSi algo salió mal, restaurá la copia: ${backupPath}`);
