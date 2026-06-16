import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "./schema";

const client = new Database("./data/club.db");
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database...");

  // Clear existing data
  await db.delete(schema.paymentQuotas);
  await db.delete(schema.payments);
  await db.delete(schema.quotas);
  await db.delete(schema.players);
  await db.delete(schema.guardians);
  await db.delete(schema.quotaConfigs);
  await db.delete(schema.transactions);
  await db.delete(schema.alertLogs);
  await db.delete(schema.settings);

  // ─── Settings ─────────────────────────────────────────────
  await db.insert(schema.settings).values([
    { key: "interestRate", value: "0.5" },
    { key: "graceDays", value: "3" },
    { key: "dueDay", value: "10" },
    { key: "discountEnabled", value: "true" },
    { key: "discountPercent", value: "10" },
  ]);

  // ─── Quota Configs ────────────────────────────────────────
  await db.insert(schema.quotaConfigs).values([
    { category: "2014", baseAmount: 45000, siblingDiscountPercent: 10 },
    { category: "2013", baseAmount: 50000, siblingDiscountPercent: 10 },
    { category: "2012", baseAmount: 55000, siblingDiscountPercent: 10 },
    { category: "2011", baseAmount: 60000, siblingDiscountPercent: 10 },
    { category: "2010", baseAmount: 65000, siblingDiscountPercent: 10 },
    { category: "2009", baseAmount: 70000, siblingDiscountPercent: 10 },
  ]);

  // ─── Guardians ────────────────────────────────────────────
  const guardianData = [
    { name: "Carlos Rodriguez", dni: "25123456", phone: "+5491123456789", email: "carlos@email.com", address: "Av. Libertador 1234", pin: "1234" },
    { name: "Maria Gonzalez", dni: "27876543", phone: "+5491167890123", email: "maria@email.com", address: "Calle Mitre 567", pin: "5678" },
    { name: "Juan Perez", dni: "20345678", phone: "+5491145678901", email: "juan@email.com", address: "Av. Corrientes 890", pin: "9012" },
    { name: "Ana Martinez", dni: "29567890", phone: "+5491189012345", email: "ana@email.com", address: "Calle San Martin 234", pin: "3456" },
    { name: "Luis Fernandez", dni: "22345678", phone: "+5491134567890", email: "luis@email.com", address: "Av. Belgrano 456", pin: "7890" },
    { name: "Sofia Lopez", dni: "30765432", phone: "+5491178901234", email: "sofia@email.com", address: "Calle Sarmiento 789", pin: "2345" },
    { name: "Diego Sanchez", dni: "21456789", phone: "+5491156789012", email: "diego@email.com", address: "Av. Rivadavia 3210", pin: "6789" },
    { name: "Laura Torres", dni: "28654321", phone: "+5491190123456", email: "laura@email.com", address: "Calle Reconquista 654", pin: "4567" },
    { name: "Roberto Diaz", dni: "23456789", phone: "+5491123456790", email: "roberto@email.com", address: "Av. de Mayo 987", pin: "8901" },
    { name: "Patricia Ruiz", dni: "31765432", phone: "+5491167890124", email: "patricia@email.com", address: "Calle Florida 147", pin: "0123" },
    { name: "Fernando Silva", dni: "24567890", phone: "+5491145678902", email: "fernando@email.com", address: "Av. Santa Fe 258" },
    { name: "Carmen Vega", dni: "32654321", phone: "+5491189012346", email: "carmen@email.com", address: "Calle Esmeralda 369" },
  ];

  for (const g of guardianData) {
    await db.insert(schema.guardians).values(g);
  }

  const guardians = await db.select().from(schema.guardians);
  const guardianMap = new Map(guardians.map((g, i) => [i, g.id]));

  // ─── Players ──────────────────────────────────────────────
  const playerData = [
    { name: "Mateo Rodriguez", dni: "54123456", birthDate: "2014-03-15", category: "2014", guardianId: guardianMap.get(0) },
    { name: "Lucas Rodriguez", dni: "53765432", birthDate: "2012-07-22", category: "2012", guardianId: guardianMap.get(0) },
    { name: "Valentina Gonzalez", dni: "55456789", birthDate: "2013-11-08", category: "2013", guardianId: guardianMap.get(1) },
    { name: "Santiago Gonzalez", dni: "54890123", birthDate: "2011-05-20", category: "2011", guardianId: guardianMap.get(1) },
    { name: "Thiago Perez", dni: "56123456", birthDate: "2010-09-01", category: "2010", guardianId: guardianMap.get(2) },
    { name: "Martina Martinez", dni: "57234567", birthDate: "2014-01-30", category: "2014", guardianId: guardianMap.get(3) },
    { name: "Benjamin Fernandez", dni: "58456789", birthDate: "2013-04-12", category: "2013", guardianId: guardianMap.get(4) },
    { name: "Emma Fernandez", dni: "58012345", birthDate: "2011-08-25", category: "2011", guardianId: guardianMap.get(4) },
    { name: "Dante Fernandez", dni: "57678901", birthDate: "2009-12-18", category: "2009", guardianId: guardianMap.get(4) },
    { name: "Olivia Lopez", dni: "59345678", birthDate: "2012-06-05", category: "2012", guardianId: guardianMap.get(5) },
    { name: "Maximo Sanchez", dni: "60765432", birthDate: "2014-10-14", category: "2014", guardianId: guardianMap.get(6) },
    { name: "Isabella Torres", dni: "61456789", birthDate: "2011-02-28", category: "2011", guardianId: guardianMap.get(7) },
    { name: "Liam Diaz", dni: "62901234", birthDate: "2013-09-09", category: "2013", guardianId: guardianMap.get(8) },
    { name: "Zoe Ruiz", dni: "63567890", birthDate: "2010-07-16", category: "2010", guardianId: guardianMap.get(9) },
    { name: "Noah Silva", dni: "64234567", birthDate: "2012-03-22", category: "2012", guardianId: guardianMap.get(10) },
    { name: "Mia Vega", dni: "65890123", birthDate: "2014-12-01", category: "2014", guardianId: guardianMap.get(11) },
    { name: "Ethan Rodriguez", dni: "66123456", birthDate: "2011-11-11", category: "2011", guardianId: guardianMap.get(0) },
    { name: "Ava Perez", dni: "67456789", birthDate: "2013-05-30", category: "2013", guardianId: guardianMap.get(2) },
    { name: "Leo Martinez", dni: "68765432", birthDate: "2009-08-08", category: "2009", guardianId: guardianMap.get(3) },
    { name: "Sofia Sanchez", dni: "69567890", birthDate: "2010-04-03", category: "2010", guardianId: guardianMap.get(6) },
  ];

  for (const p of playerData) {
    await db.insert(schema.players).values(p);
  }

  const players = await db.select().from(schema.players);

  // ─── Quotas ───────────────────────────────────────────────
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  for (const player of players) {
    const config = await db.select().from(schema.quotaConfigs)
      .where(eq(schema.quotaConfigs.category, player.category))
      .limit(1);
    const baseAmount = config[0]?.baseAmount ?? 50000;

    // Check siblings for discount
    const siblings = await db.select({ count: sql<number>`count(*)` }).from(schema.players)
      .where(and(eq(schema.players.guardianId, player.guardianId!), eq(schema.players.status, "active")));
    const siblingCount = siblings[0]?.count ?? 0;
    const discountPercent = config[0]?.siblingDiscountPercent ?? (siblingCount > 1 ? 10 : 0);
    const discountAmount = siblingCount > 1 ? Math.round(baseAmount * (discountPercent / 100)) : 0;

    // Create quotas for last 3 months
    for (let i = 0; i < 3; i++) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) { month += 12; year -= 1; }

      const dueDate = `${year}-${String(month).padStart(2, "0")}-10`;

      // Random status distribution
      let status: "pending" | "paid" | "overdue";
      const rand = Math.random();
      if (i === 0) {
        status = rand < 0.4 ? "paid" : rand < 0.7 ? "pending" : "overdue";
      } else if (i === 1) {
        status = rand < 0.6 ? "paid" : "overdue";
      } else {
        status = rand < 0.7 ? "paid" : "overdue";
      }

      const interestAmount = status === "overdue" ? Math.round(baseAmount * 0.005 * Math.floor(Math.random() * 15)) : 0;
      const totalAmount = baseAmount - discountAmount + interestAmount;

      const [quota] = await db.insert(schema.quotas).values({
        playerId: player.id,
        month,
        year,
        baseAmount,
        discountAmount,
        interestAmount,
        totalAmount,
        dueDate,
        status,
        paymentDate: status === "paid" ? `${year}-${String(month).padStart(2, "0")}-${String(Math.floor(Math.random() * 9) + 1)}` : null,
        paymentMethod: status === "paid" ? (["cash", "transfer", "mercadopago"] as const)[Math.floor(Math.random() * 3)] : null,
      }).returning();

      // Create payment record for paid quotas
      if (status === "paid" && player.guardianId) {
        const payment = await db.insert(schema.payments).values({
          guardianId: player.guardianId,
          totalAmount,
          paymentDate: quota.paymentDate!,
          paymentMethod: quota.paymentMethod!,
          receiptNumber: `R-${year}-${String(quota.id).padStart(4, "0")}`,
        }).returning();

        await db.insert(schema.paymentQuotas).values({
          paymentId: payment[0].id,
          quotaId: quota.id,
        });
      }
    }
  }

  // ─── Transactions ─────────────────────────────────────────
  const transactionData = [
    { type: "income" as const, category: "Cuotas", description: "Cobro cuotas mayo", amount: 850000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-15` },
    { type: "income" as const, category: "Cuotas", description: "Cobro cuotas abril", amount: 920000, date: `${currentYear}-${String(currentMonth - 1).padStart(2, "0")}-18` },
    { type: "income" as const, category: "Venta", description: "Venta merchandising", amount: 125000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-05` },
    { type: "income" as const, category: "Eventos", description: "Torneo interno", amount: 300000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-22` },
    { type: "expense" as const, category: "Salarios", description: "Sueldo entrenadores", amount: 650000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-01` },
    { type: "expense" as const, category: "Mantenimiento", description: "Corte de cesped", amount: 80000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-08` },
    { type: "expense" as const, category: "Servicios", description: "Luz y agua", amount: 145000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-12` },
    { type: "expense" as const, category: "Equipamiento", description: "Pelotas y conos", amount: 95000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-20` },
    { type: "income" as const, category: "Cuotas", description: "Cobro cuotas marzo", amount: 880000, date: `${currentYear}-${String(currentMonth - 2).padStart(2, "0")}-20` },
    { type: "expense" as const, category: "Salarios", description: "Sueldo secretaria", amount: 320000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-01` },
    { type: "expense" as const, category: "Mantenimiento", description: "Pintura vestuarios", amount: 180000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-25` },
    { type: "income" as const, category: "Donaciones", description: "Aporte socio vitalicio", amount: 500000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-28` },
    { type: "expense" as const, category: "Transporte", description: "Viaje torneo", amount: 220000, date: `${currentYear}-${String(currentMonth - 1).padStart(2, "0")}-10` },
    { type: "income" as const, category: "Cuotas", description: "Cobro cuotas junio", amount: 750000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-30` },
    { type: "expense" as const, category: "Servicios", description: "Internet", amount: 25000, date: `${currentYear}-${String(currentMonth).padStart(2, "0")}-15` },
  ];

  for (const t of transactionData) {
    await db.insert(schema.transactions).values(t);
  }

  console.log("Seed complete!");
  console.log(`- ${guardians.length} guardians`);
  console.log(`- ${players.length} players`);
  console.log(`- ${transactionData.length} transactions`);
  // Insert default admin user
await db.insert(schema.localUsers).values({
  username: "admin",
  password: "admin123", // en producción: hashear con bcrypt
  name: "Administrador",
  role: "admin",
});
  client.close();

}

seed().catch(console.error);
