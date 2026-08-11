import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import * as schema from "./schema";

/**
 * Datos de ejemplo para desarrollo.
 *
 * ⚠️ **Borra todo lo que haya en la base.** No correr sobre los datos reales del
 * club: para eso está `scripts/migrate-to-postgres.mjs`, que importa sin perder
 * nada.
 *
 * Correr con:  npm run db:seed
 */

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (o DIRECT_URL) en el .env");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

/** Mismo formato que `api/lib/crypto.ts`, replicado para no depender de alias. */
function hash(plain: string): string {
  const cost = 32768;
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64, { N: cost, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${cost}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

async function seed() {
  console.log("Sembrando la base de datos…");

  // `TRUNCATE ... CASCADE` limpia todo respetando las foreign keys y reinicia
  // los contadores de los `serial`, así los ids arrancan de 1 en cada corrida.
  await db.execute(sql`
    TRUNCATE TABLE
      payment_quotas, payments, quotas, alert_logs, daily_closures,
      players, guardians, categories, transactions, settings,
      receipt_sequences, local_users, login_attempts, users
    RESTART IDENTITY CASCADE
  `);

  // ─── Configuración ──────────────────────────────────────────
  await db.insert(schema.settings).values([
    { key: "interestRate", value: "0.5" },
    { key: "graceDays", value: "3" },
    { key: "dueDay", value: "10" },
    { key: "discountEnabled", value: "true" },
    { key: "discountPercent", value: "10" },
    { key: "clubName", value: "Club Atlético del Barrio" },
    { key: "bankName", value: "Banco Nación" },
    { key: "bankCbu", value: "0110123456789012345678" },
    { key: "bankAlias", value: "CLUB.ATLETICO.PAGO" },
    { key: "bankHolder", value: "Club Atlético del Barrio" },
  ]);

  // ─── Usuarios del panel ─────────────────────────────────────
  await db.insert(schema.localUsers).values([
    { username: "admin", password: hash("admin123"), name: "Administrador", role: "admin" },
    { username: "secretaria", password: hash("secre123"), name: "Secretaría", role: "secretary" },
  ]);

  // ─── Categorías (única fuente de verdad de los montos) ──────
  await db.insert(schema.categories).values([
    { name: "2014", baseAmount: 45000, siblingDiscountPercent: 10, paysQuota: true },
    { name: "2013", baseAmount: 50000, siblingDiscountPercent: 10, paysQuota: true },
    { name: "2012", baseAmount: 55000, siblingDiscountPercent: 10, paysQuota: true },
    { name: "2011", baseAmount: 60000, siblingDiscountPercent: 10, paysQuota: true },
    { name: "2010", baseAmount: 65000, siblingDiscountPercent: 10, paysQuota: true },
    { name: "2009", baseAmount: 70000, siblingDiscountPercent: 10, paysQuota: true },
    {
      name: "Primera",
      baseAmount: 0,
      paysQuota: false,
      description: "Plantel superior, no abona cuota social",
    },
  ]);

  // ─── Tutores ────────────────────────────────────────────────
  const guardians = await db
    .insert(schema.guardians)
    .values([
      { name: "Carlos Rodríguez", dni: "25123456", phone: "+5491123456789", email: "carlos@email.com", address: "Av. Libertador 1234" },
      { name: "María González", dni: "27876543", phone: "+5491167890123", email: "maria@email.com", address: "Calle Mitre 567" },
      { name: "Juan Pérez", dni: "20345678", phone: "+5491145678901", email: "juan@email.com", address: "Av. Corrientes 890" },
      { name: "Ana Martínez", dni: "29567890", phone: "+5491189012345", email: "ana@email.com", address: "Calle San Martín 234" },
      { name: "Luis Fernández", dni: "22345678", phone: "+5491134567890", email: "luis@email.com", address: "Av. Belgrano 456" },
      { name: "Sofía López", dni: "30765432", phone: "+5491178901234", email: "sofia@email.com", address: "Calle Sarmiento 789" },
    ])
    .returning();

  // ─── Socios ─────────────────────────────────────────────────
  const players = await db
    .insert(schema.players)
    .values([
      { name: "Mateo Rodríguez", dni: "54123456", birthDate: "2014-03-15", category: "2014", guardianId: guardians[0].id },
      { name: "Lucas Rodríguez", dni: "53765432", birthDate: "2012-07-22", category: "2012", guardianId: guardians[0].id },
      { name: "Valentina González", dni: "55456789", birthDate: "2013-11-08", category: "2013", guardianId: guardians[1].id },
      { name: "Santiago González", dni: "54890123", birthDate: "2011-05-20", category: "2011", guardianId: guardians[1].id },
      { name: "Thiago Pérez", dni: "56123456", birthDate: "2010-09-01", category: "2010", guardianId: guardians[2].id },
      { name: "Martina Martínez", dni: "57234567", birthDate: "2014-01-30", category: "2014", guardianId: guardians[3].id },
      { name: "Benjamín Fernández", dni: "58456789", birthDate: "2013-04-12", category: "2013", guardianId: guardians[4].id },
      { name: "Emma Fernández", dni: "58012345", birthDate: "2011-08-25", category: "2011", guardianId: guardians[4].id },
      { name: "Olivia López", dni: "59345678", birthDate: "2012-06-05", category: "2012", guardianId: guardians[5].id },
      // Socio mayor sin tutor: entra al portal con su propio DNI.
      { name: "Diego Sosa", dni: "33456789", birthDate: "1998-02-14", category: "2009", guardianId: null },
    ].map((p) => ({ ...p, registrationDate: "2026-02-01" })))
    .returning();

  const categories = await db.select().from(schema.categories);
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  // Cuántos socios activos tiene cada familia, para el descuento por hermanos.
  const siblingCount = new Map<number, number>();
  for (const player of players) {
    if (player.guardianId == null) continue;
    siblingCount.set(player.guardianId, (siblingCount.get(player.guardianId) ?? 0) + 1);
  }

  // ─── Cuotas de los últimos 3 meses ─────────────────────────
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  let receiptCounter = 0;

  for (const player of players) {
    const category = categoryByName.get(player.category);
    if (!category || !category.paysQuota) continue;

    const siblings = player.guardianId ? (siblingCount.get(player.guardianId) ?? 1) : 1;
    const discountAmount =
      siblings >= 2 ? Math.round(category.baseAmount * (category.siblingDiscountPercent / 100)) : 0;

    for (let back = 0; back < 3; back++) {
      let month = currentMonth - back;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }

      // Los meses viejos quedan pagados; el actual, pendiente. Sin aleatoriedad,
      // para que el estado del entorno de desarrollo sea reproducible.
      const isPaid = back > 0;
      const totalAmount = category.baseAmount - discountAmount;
      const paymentDate = isPaid ? `${year}-${pad(month)}-05` : null;
      const receiptNumber = isPaid
        ? `R-${year}-${String(++receiptCounter).padStart(4, "0")}`
        : null;

      const quota = (
        await db
          .insert(schema.quotas)
          .values({
            playerId: player.id,
            month,
            year,
            baseAmount: category.baseAmount,
            discountAmount,
            interestAmount: 0,
            totalAmount,
            dueDate: `${year}-${pad(month)}-10`,
            status: isPaid ? "paid" : "pending",
            paymentDate,
            paymentMethod: isPaid ? "cash" : null,
            receiptNumber,
          })
          .returning()
      )[0];

      if (isPaid) {
        const payment = (
          await db
            .insert(schema.payments)
            .values({
              guardianId: player.guardianId,
              playerId: player.guardianId ? null : player.id,
              totalAmount,
              paymentDate: paymentDate!,
              paymentMethod: "cash",
              status: "confirmed",
              source: "panel",
              receiptNumber,
            })
            .returning()
        )[0];

        await db
          .insert(schema.paymentQuotas)
          .values({ paymentId: payment.id, quotaId: quota.id, amount: totalAmount });
      }
    }
  }

  await db
    .insert(schema.receiptSequences)
    .values({ year: currentYear, lastNumber: receiptCounter })
    .onConflictDoUpdate({
      target: schema.receiptSequences.year,
      set: { lastNumber: receiptCounter },
    });

  // ─── Movimientos de caja ────────────────────────────────────
  await db.insert(schema.transactions).values([
    { type: "expense", category: "Salarios", description: "Sueldo entrenadores", amount: 650000, date: `${currentYear}-${pad(currentMonth)}-01`, method: "transfer" },
    { type: "expense", category: "Mantenimiento", description: "Corte de césped", amount: 80000, date: `${currentYear}-${pad(currentMonth)}-08`, method: "cash" },
    { type: "expense", category: "Servicios", description: "Luz y agua", amount: 145000, date: `${currentYear}-${pad(currentMonth)}-12`, method: "transfer" },
    { type: "income", category: "Buffet", description: "Recaudación del buffet", amount: 125000, date: `${currentYear}-${pad(currentMonth)}-05`, method: "cash" },
    { type: "income", category: "Eventos", description: "Torneo interno", amount: 300000, date: `${currentYear}-${pad(currentMonth)}-22`, method: "cash" },
  ]);

  console.log("Listo.");
  console.log(`  ${guardians.length} tutores`);
  console.log(`  ${players.length} socios`);
  console.log(`  ${categories.length} categorías`);
  console.log("");
  console.log("Usuarios del panel:");
  console.log("  admin / admin123        (administrador)");
  console.log("  secretaria / secre123   (secretaría)");
  console.log("");
  console.log("Cambiá esas contraseñas antes de usarlo en el club.");
}

seed()
  .catch((error) => {
    console.error("Falló el seed:", error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
