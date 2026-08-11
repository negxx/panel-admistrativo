import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Esquema de la base (PostgreSQL + Drizzle).
 *
 * Convenciones del proyecto:
 *
 * - **Los importes se guardan en pesos enteros**, sin centavos. El club no cobra
 *   centavos y así se evitan errores de redondeo con números flotantes.
 * - **Las fechas de calendario** (vencimiento, fecha de pago, fecha de cierre)
 *   son `date`. Drizzle las entrega como texto `YYYY-MM-DD`, así que el código
 *   las sigue tratando como strings, pero la base valida y ordena de verdad.
 * - **Las marcas de tiempo técnicas** (`createdAt`, `sentAt`) son `timestamptz`.
 * - **Los secretos** (`password`, `pin`) guardan un hash scrypt, no el texto
 *   plano. Ver `api/lib/crypto.ts`.
 *
 * Los enums se declaran como `text` con la lista de valores permitidos: dan el
 * mismo tipado en TypeScript que un `pgEnum`, pero agregar un valor nuevo es
 * cambiar una línea en vez de una migración con `ALTER TYPE`.
 */

/** Fecha de calendario en texto `YYYY-MM-DD`. */
const clubDate = (name: string) => date(name, { mode: "string" });

/** Marca de tiempo con zona horaria. */
const stamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ─── Usuarios de Kimi (login por OAuth) ──────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("avatar"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: stamp("createdAt").defaultNow(),
  updatedAt: stamp("updatedAt").defaultNow(),
  lastSignInAt: stamp("lastSignInAt").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Usuarios del panel (login local con usuario y contraseña) ───────────────

export const localUsers = pgTable("local_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  /** Hash scrypt. Nunca guardar la contraseña en texto plano. */
  password: text("password").notNull(),
  name: text("name").notNull(),
  /**
   * `admin` accede a todo. `secretary` no puede administrar usuarios,
   * categorías ni borrar cierres de caja.
   */
  role: text("role", { enum: ["admin", "secretary"] }).default("admin").notNull(),
  createdAt: stamp("createdAt").defaultNow(),
});

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

// ─── Tutores (padres / responsables) ─────────────────────────────────────────

export const guardians = pgTable(
  "guardians",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    dni: text("dni").notNull().unique(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    whatsappEnabled: boolean("whatsappEnabled").default(true).notNull(),
    /** Hash scrypt del PIN de 4 dígitos del portal. `null` = todavía no lo activó. */
    pin: text("pin"),
    createdAt: stamp("createdAt").defaultNow(),
  },
  (table) => [index("guardians_name_idx").on(table.name)],
);

export type Guardian = typeof guardians.$inferSelect;
export type InsertGuardian = typeof guardians.$inferInsert;

// ─── Socios deportivos (jugadores) ───────────────────────────────────────────

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    dni: text("dni").notNull().unique(),
    /** Se usa además para activar el PIN del portal. */
    birthDate: clubDate("birthDate").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    /** Nombre de la categoría. Referencia por nombre a `categories.name`. */
    category: text("category").notNull(),
    /** `null` para socios mayores que se manejan solos. */
    guardianId: integer("guardianId").references(() => guardians.id),
    registrationDate: clubDate("registrationDate"),
    status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
    photoUrl: text("photoUrl"),
    notes: text("notes"),
    createdAt: stamp("createdAt").defaultNow(),
    quotaType: text("quotaType", { enum: ["deportivo", "hermanos", "individual"] }).default(
      "deportivo",
    ),
    /** Hash scrypt del PIN del portal, sólo para socios sin tutor. */
    pin: text("pin"),
  },
  (table) => [
    index("players_guardian_idx").on(table.guardianId),
    index("players_category_idx").on(table.category),
    index("players_status_idx").on(table.status),
    index("players_name_idx").on(table.name),
  ],
);

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

// ─── Categorías ──────────────────────────────────────────────────────────────

/**
 * Única fuente de verdad de cuánto sale la cuota.
 *
 * Antes esta información estaba duplicada en `categories` y en `quota_configs`,
 * y cada pantalla leía una tabla distinta: al alta de un socio se le cobraba un
 * monto y al generar el mes, otro.
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  /** Ej: "2014", "5ta", "Primera". Único: es la clave que usan los socios. */
  name: text("name").notNull().unique(),
  /** Si está en `false`, a esta categoría no se le generan cuotas. */
  paysQuota: boolean("paysQuota").default(true).notNull(),
  /** Monto mensual en pesos. */
  baseAmount: integer("baseAmount").default(0).notNull(),
  /** Descuento que se aplica cuando la familia tiene 2 o más socios activos. */
  siblingDiscountPercent: integer("siblingDiscountPercent").default(0).notNull(),
  description: text("description"),
  createdAt: stamp("createdAt").defaultNow(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

// ─── Cuotas ──────────────────────────────────────────────────────────────────

export const quotas = pgTable(
  "quotas",
  {
    id: serial("id").primaryKey(),
    playerId: integer("playerId")
      .notNull()
      .references(() => players.id),
    /** 1-12. */
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    /** Monto de lista de la categoría al momento de generar la cuota. */
    baseAmount: integer("baseAmount").notNull(),
    /** Descuento por hermanos, en pesos. */
    discountAmount: integer("discountAmount").default(0).notNull(),
    /** Interés por mora acumulado. Lo actualiza `syncOverdueQuotas`. */
    interestAmount: integer("interestAmount").default(0).notNull(),
    /** `baseAmount - discountAmount + interestAmount`. Es lo que hay que pagar. */
    totalAmount: integer("totalAmount").notNull(),
    dueDate: clubDate("dueDate").notNull(),
    status: text("status", { enum: ["pending", "paid", "overdue"] })
      .default("pending")
      .notNull(),
    paymentDate: clubDate("paymentDate"),
    paymentMethod: text("paymentMethod", { enum: ["cash", "transfer", "mercadopago"] }),
    receiptNumber: text("receiptNumber"),
    notes: text("notes"),
    createdAt: stamp("createdAt").defaultNow(),
  },
  (table) => [
    /** Impide generar dos veces la cuota del mismo mes para el mismo socio. */
    uniqueIndex("quotas_player_period_idx").on(table.playerId, table.year, table.month),
    index("quotas_status_idx").on(table.status),
    index("quotas_due_date_idx").on(table.dueDate),
  ],
);

export type Quota = typeof quotas.$inferSelect;
export type InsertQuota = typeof quotas.$inferInsert;

// ─── Pagos ───────────────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    /** Quién pagó, si es una familia. Mutuamente excluyente con `playerId`. */
    guardianId: integer("guardianId").references(() => guardians.id),
    /** Quién pagó, si es un socio sin tutor. */
    playerId: integer("playerId").references(() => players.id),
    totalAmount: integer("totalAmount").notNull(),
    paymentDate: clubDate("paymentDate").notNull(),
    paymentMethod: text("paymentMethod", { enum: ["cash", "transfer", "mercadopago"] }).notNull(),
    /**
     * `confirmed`: el dinero está en el club.
     * `pending_review`: lo informó un socio desde el portal, falta que la
     *   secretaría lo verifique. No salda cuotas hasta confirmarse.
     * `rejected`: se revisó y no correspondía.
     */
    status: text("status", { enum: ["confirmed", "pending_review", "rejected"] })
      .default("confirmed")
      .notNull(),
    /** De dónde vino el pago. Sirve para auditar. */
    source: text("source", { enum: ["panel", "portal"] }).default("panel").notNull(),
    mercadopagoPaymentId: text("mercadopagoPaymentId"),
    /**
     * Número de recibo. Se asigna recién al confirmar el pago, para no gastar
     * numeración en pagos que terminan rechazados. Ver `api/domain/receipts.ts`.
     */
    receiptNumber: text("receiptNumber"),
    /** Dato que informa el socio: número de operación, alias, etc. */
    reference: text("reference"),
    notes: text("notes"),
    /** Usuario del panel que confirmó o rechazó el pago. */
    reviewedBy: integer("reviewedBy").references(() => localUsers.id),
    reviewedAt: stamp("reviewedAt"),
    /** Usuario del panel que registró el pago (si vino del panel). */
    createdBy: integer("createdBy").references(() => localUsers.id),
    createdAt: stamp("createdAt").defaultNow(),
  },
  (table) => [
    // En Postgres un índice único admite varios NULL, así que los pagos
    // pendientes (sin recibo todavía) no chocan entre sí.
    uniqueIndex("payments_receipt_idx").on(table.receiptNumber),
    index("payments_date_idx").on(table.paymentDate),
    index("payments_guardian_idx").on(table.guardianId),
    index("payments_player_idx").on(table.playerId),
    index("payments_status_idx").on(table.status),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── Pagos ↔ Cuotas (tabla intermedia) ───────────────────────────────────────

export const paymentQuotas = pgTable(
  "payment_quotas",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("paymentId")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    quotaId: integer("quotaId")
      .notNull()
      .references(() => quotas.id),
    /** Importe de la cuota al momento del pago, congelado para el recibo. */
    amount: integer("amount").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("payment_quotas_pair_idx").on(table.paymentId, table.quotaId),
    index("payment_quotas_quota_idx").on(table.quotaId),
  ],
);

export type PaymentQuota = typeof paymentQuotas.$inferSelect;

// ─── Numeración de recibos ───────────────────────────────────────────────────

/**
 * Contador de recibos por año.
 *
 * Antes el número salía de `COUNT(*)` de los pagos del mes pero se formateaba
 * con el año: en febrero la numeración volvía a empezar y se repetían recibos.
 * Este contador se incrementa con un `INSERT ... ON CONFLICT DO UPDATE`
 * atómico, así que no se repite ni con dos cajas cobrando a la vez.
 */
export const receiptSequences = pgTable("receipt_sequences", {
  year: integer("year").primaryKey(),
  lastNumber: integer("lastNumber").default(0).notNull(),
});

// ─── Movimientos de caja (ingresos y egresos) ────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    date: clubDate("date").notNull(),
    /**
     * Con qué medio se movió la plata. Importa para el arqueo: sólo lo que sale
     * en efectivo descuenta del efectivo esperado en caja.
     */
    method: text("method", { enum: ["cash", "transfer", "mercadopago"] })
      .default("cash")
      .notNull(),
    attachmentUrl: text("attachmentUrl"),
    createdBy: integer("createdBy").references(() => localUsers.id),
    createdAt: stamp("createdAt").defaultNow(),
  },
  (table) => [
    index("transactions_date_idx").on(table.date),
    index("transactions_type_idx").on(table.type),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Registro de alertas enviadas ────────────────────────────────────────────

export const alertLogs = pgTable(
  "alert_logs",
  {
    id: serial("id").primaryKey(),
    guardianId: integer("guardianId").references(() => guardians.id),
    /** Para socios sin tutor. */
    playerId: integer("playerId").references(() => players.id),
    /** JSON con los ids de cuota incluidos en el aviso. */
    quotaIds: text("quotaIds").notNull(),
    message: text("message").notNull(),
    /**
     * `prepared`: se generó el link de WhatsApp y quedó en manos del operador.
     * `sent`: se confirmó el envío. `failed`: no se pudo generar.
     */
    status: text("status", { enum: ["prepared", "sent", "failed"] }).notNull(),
    sentAt: stamp("sentAt").defaultNow(),
  },
  (table) => [
    index("alert_logs_guardian_idx").on(table.guardianId),
    index("alert_logs_sent_at_idx").on(table.sentAt),
  ],
);

export type AlertLog = typeof alertLogs.$inferSelect;

// ─── Configuración global (clave / valor) ────────────────────────────────────

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: stamp("updatedAt").defaultNow(),
});

export type Setting = typeof settings.$inferSelect;

// ─── Cierre de caja diario ───────────────────────────────────────────────────

export const dailyClosures = pgTable(
  "daily_closures",
  {
    id: serial("id").primaryKey(),
    /** Único: un solo cierre por día. */
    date: clubDate("date").notNull().unique(),
    openedBy: integer("openedBy").references(() => localUsers.id),
    closedBy: integer("closedBy").references(() => localUsers.id),
    /** Efectivo con el que se abrió la caja. */
    openingAmount: integer("openingAmount").default(0).notNull(),
    /**
     * Los totales de abajo se recalculan desde los pagos y movimientos del día
     * (ver `api/domain/cash.ts`), no se acumulan sumando de a poco. Así el
     * arqueo siempre cuadra aunque se edite o borre algo.
     */
    cashSales: integer("cashSales").default(0).notNull(),
    transferSales: integer("transferSales").default(0).notNull(),
    mpSales: integer("mpSales").default(0).notNull(),
    /** Otros ingresos cargados a mano en Ingresos y Egresos. */
    otherIncome: integer("otherIncome").default(0).notNull(),
    totalIncome: integer("totalIncome").default(0).notNull(),
    totalExpenses: integer("totalExpenses").default(0).notNull(),
    /** Egresos pagados en efectivo: son los únicos que bajan el efectivo en caja. */
    cashExpenses: integer("cashExpenses").default(0).notNull(),
    /** `openingAmount + cashSales - cashExpenses`. */
    expectedCash: integer("expectedCash").default(0).notNull(),
    /** Lo que se contó físicamente al cerrar. */
    actualCash: integer("actualCash").default(0).notNull(),
    /** `actualCash - expectedCash`. Positivo = sobrante, negativo = faltante. */
    difference: integer("difference").default(0).notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
    createdAt: stamp("createdAt").defaultNow(),
    closedAt: stamp("closedAt"),
  },
  (table) => [index("daily_closures_status_idx").on(table.status)],
);

export type DailyClosure = typeof dailyClosures.$inferSelect;
export type InsertDailyClosure = typeof dailyClosures.$inferInsert;

// ─── Límite de intentos de ingreso ───────────────────────────────────────────

/**
 * Contador de intentos fallidos de login y de PIN.
 *
 * Antes vivía en memoria, lo cual alcanzaba con un único servidor. En Vercel
 * cada request puede tocar una instancia nueva, así que un contador en memoria
 * no limita nada: se guarda en la base.
 */
export const loginAttempts = pgTable("login_attempts", {
  /** Ej: `login:admin`, `portal-login:25123456`. */
  key: text("key").primaryKey(),
  count: integer("count").default(0).notNull(),
  /** Cuándo se reinicia la ventana de conteo. */
  resetAt: stamp("resetAt").notNull(),
  /** Hasta cuándo está bloqueado. */
  blockedUntil: stamp("blockedUntil"),
});
