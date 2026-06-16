import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// ─── Users (admin/secretary via OAuth) ───────────────────────────────────────

export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("avatar"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastSignInAt: integer("lastSignInAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Guardians (parents/tutors) ──────────────────────────────────────────────

export const guardians = sqliteTable("guardians", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dni: text("dni").notNull().unique(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  whatsappEnabled: integer("whatsappEnabled", { mode: "boolean" }).default(true),
  pin: text("pin"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Guardian = typeof guardians.$inferSelect;
export type InsertGuardian = typeof guardians.$inferInsert;

// ─── Players (socios deportivos) ─────────────────────────────────────────────

export const players = sqliteTable("players", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dni: text("dni").notNull().unique(),
  birthDate: text("birthDate").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  category: text("category").notNull(),
  guardianId: integer("guardianId", { mode: "number" }).references(() => guardians.id),
  registrationDate: text("registrationDate").$defaultFn(() => new Date().toISOString().split("T")[0]),
  status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
  photoUrl: text("photoUrl"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  quotaType: text("quotaType", { enum: ["deportivo", "hermanos", "individual"] }).default("deportivo"),
  pin: text("pin"),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

// ─── Quota Configs ───────────────────────────────────────────────────────────

export const quotaConfigs = sqliteTable("quota_configs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  category: text("category").notNull().unique(),
  baseAmount: integer("baseAmount", { mode: "number" }).notNull(),
  siblingDiscountPercent: integer("siblingDiscountPercent", { mode: "number" }).default(0).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type QuotaConfig = typeof quotaConfigs.$inferSelect;
export type InsertQuotaConfig = typeof quotaConfigs.$inferInsert;

// ─── Quotas ──────────────────────────────────────────────────────────────────

export const quotas = sqliteTable("quotas", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  playerId: integer("playerId", { mode: "number" }).notNull().references(() => players.id),
  month: integer("month", { mode: "number" }).notNull(),
  year: integer("year", { mode: "number" }).notNull(),
  baseAmount: integer("baseAmount", { mode: "number" }).notNull(),
  discountAmount: integer("discountAmount", { mode: "number" }).default(0),
  interestAmount: integer("interestAmount", { mode: "number" }).default(0),
  totalAmount: integer("totalAmount", { mode: "number" }).notNull(),
  dueDate: text("dueDate").notNull(),
  status: text("status", { enum: ["pending", "paid", "overdue"] }).default("pending").notNull(),
  paymentDate: text("paymentDate"),
  paymentMethod: text("paymentMethod", { enum: ["cash", "transfer", "mercadopago"] }),
  receiptNumber: text("receiptNumber"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Quota = typeof quotas.$inferSelect;
export type InsertQuota = typeof quotas.$inferInsert;

// ─── Payments ────────────────────────────────────────────────────────────────

export const payments = sqliteTable("payments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  guardianId: integer("guardianId", { mode: "number" }).references(() => guardians.id),
  playerId: integer("playerId", { mode: "number" }).references(() => players.id),
  totalAmount: integer("totalAmount", { mode: "number" }).notNull(),
  paymentDate: text("paymentDate").notNull(),
  paymentMethod: text("paymentMethod").notNull(),
  mercadopagoPaymentId: text("mercadopagoPaymentId"),
  receiptNumber: text("receiptNumber"),
  notes: text("notes"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── Payment Quotas (junction) ───────────────────────────────────────────────

export const paymentQuotas = sqliteTable("payment_quotas", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  paymentId: integer("paymentId", { mode: "number" }).notNull().references(() => payments.id),
  quotaId: integer("quotaId", { mode: "number" }).notNull().references(() => quotas.id),
});

export type PaymentQuota = typeof paymentQuotas.$inferSelect;

// ─── Transactions (income/expense) ───────────────────────────────────────────

export const transactions = sqliteTable("transactions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount", { mode: "number" }).notNull(),
  date: text("date").notNull(),
  attachmentUrl: text("attachmentUrl"),
  createdBy: integer("createdBy", { mode: "number" }).references(() => users.id),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Alert Logs ──────────────────────────────────────────────────────────────

export const alertLogs = sqliteTable("alert_logs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  guardianId: integer("guardianId", { mode: "number" }).notNull().references(() => guardians.id),
  quotaIds: text("quotaIds").notNull(), // JSON array
  message: text("message").notNull(),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  sentAt: integer("sentAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type AlertLog = typeof alertLogs.$inferSelect;

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
// ─── Local Users (admin login) ───────────────────────────────────────────────

export const localUsers = sqliteTable("local_users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // en producción: hasheada con bcrypt
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "secretary"] }).default("admin").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
 
// ─── Daily Closures (Cierre de Caja) ─────────────────────────────────────────

export const dailyClosures = sqliteTable("daily_closures", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  openedBy: integer("openedBy", { mode: "number" }).references(() => localUsers.id),
  closedBy: integer("closedBy", { mode: "number" }).references(() => localUsers.id),
  openingAmount: integer("openingAmount", { mode: "number" }).default(0), // Efectivo inicial
  cashSales: integer("cashSales", { mode: "number" }).default(0), // Ventas en efectivo
  transferSales: integer("transferSales", { mode: "number" }).default(0), // Ventas transferencia
  mpSales: integer("mpSales", { mode: "number" }).default(0), // Ventas MercadoPago
  totalIncome: integer("totalIncome", { mode: "number" }).default(0), // Total ingresos
  totalExpenses: integer("totalExpenses", { mode: "number" }).default(0), // Total egresos
  expectedCash: integer("expectedCash", { mode: "number" }).default(0), // Efectivo que debería haber
  actualCash: integer("actualCash", { mode: "number" }).default(0), // Efectivo contado
  difference: integer("difference", { mode: "number" }).default(0), // Diferencia (positivo = sobrante, negativo = faltante)
  notes: text("notes"),
  status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
  closedAt: integer("closedAt", { mode: "timestamp" }),
});

// ─── Categories ─────────────────────────────────────────

export const categories = sqliteTable("categories", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // "5ta", "6ta", "7ma", "Individual", "Hermanos"
  paysQuota: integer("paysQuota", { mode: "boolean" }).default(true), // true/false
  baseAmount: integer("baseAmount", { mode: "number" }).default(0), // monto de cuota
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;


export type DailyClosure = typeof dailyClosures.$inferSelect;
export type InsertDailyClosure = typeof dailyClosures.$inferInsert;

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

export type Setting = typeof settings.$inferSelect;
