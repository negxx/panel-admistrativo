CREATE TABLE "alert_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guardianId" integer,
	"playerId" integer,
	"quotaIds" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"sentAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"paysQuota" boolean DEFAULT true NOT NULL,
	"baseAmount" integer DEFAULT 0 NOT NULL,
	"siblingDiscountPercent" integer DEFAULT 0 NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "daily_closures" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"openedBy" integer,
	"closedBy" integer,
	"openingAmount" integer DEFAULT 0 NOT NULL,
	"cashSales" integer DEFAULT 0 NOT NULL,
	"transferSales" integer DEFAULT 0 NOT NULL,
	"mpSales" integer DEFAULT 0 NOT NULL,
	"otherIncome" integer DEFAULT 0 NOT NULL,
	"totalIncome" integer DEFAULT 0 NOT NULL,
	"totalExpenses" integer DEFAULT 0 NOT NULL,
	"cashExpenses" integer DEFAULT 0 NOT NULL,
	"expectedCash" integer DEFAULT 0 NOT NULL,
	"actualCash" integer DEFAULT 0 NOT NULL,
	"difference" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"closedAt" timestamp with time zone,
	CONSTRAINT "daily_closures_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dni" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"whatsappEnabled" boolean DEFAULT true NOT NULL,
	"pin" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guardians_dni_unique" UNIQUE("dni")
);
--> statement-breakpoint
CREATE TABLE "local_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "local_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"resetAt" timestamp with time zone NOT NULL,
	"blockedUntil" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_quotas" (
	"id" serial PRIMARY KEY NOT NULL,
	"paymentId" integer NOT NULL,
	"quotaId" integer NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"guardianId" integer,
	"playerId" integer,
	"totalAmount" integer NOT NULL,
	"paymentDate" date NOT NULL,
	"paymentMethod" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"source" text DEFAULT 'panel' NOT NULL,
	"mercadopagoPaymentId" text,
	"receiptNumber" text,
	"reference" text,
	"notes" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp with time zone,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dni" text NOT NULL,
	"birthDate" date NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"category" text NOT NULL,
	"guardianId" integer,
	"registrationDate" date,
	"status" text DEFAULT 'active' NOT NULL,
	"photoUrl" text,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"quotaType" text DEFAULT 'deportivo',
	"pin" text,
	CONSTRAINT "players_dni_unique" UNIQUE("dni")
);
--> statement-breakpoint
CREATE TABLE "quotas" (
	"id" serial PRIMARY KEY NOT NULL,
	"playerId" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"baseAmount" integer NOT NULL,
	"discountAmount" integer DEFAULT 0 NOT NULL,
	"interestAmount" integer DEFAULT 0 NOT NULL,
	"totalAmount" integer NOT NULL,
	"dueDate" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paymentDate" date,
	"paymentMethod" text,
	"receiptNumber" text,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "receipt_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"lastNumber" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"attachmentUrl" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"unionId" text NOT NULL,
	"name" text,
	"email" text,
	"avatar" text,
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"lastSignInAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_unionId_unique" UNIQUE("unionId")
);
--> statement-breakpoint
ALTER TABLE "alert_logs" ADD CONSTRAINT "alert_logs_guardianId_guardians_id_fk" FOREIGN KEY ("guardianId") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_logs" ADD CONSTRAINT "alert_logs_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closures" ADD CONSTRAINT "daily_closures_openedBy_local_users_id_fk" FOREIGN KEY ("openedBy") REFERENCES "public"."local_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closures" ADD CONSTRAINT "daily_closures_closedBy_local_users_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."local_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_quotas" ADD CONSTRAINT "payment_quotas_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_quotas" ADD CONSTRAINT "payment_quotas_quotaId_quotas_id_fk" FOREIGN KEY ("quotaId") REFERENCES "public"."quotas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_guardianId_guardians_id_fk" FOREIGN KEY ("guardianId") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewedBy_local_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."local_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdBy_local_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."local_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_guardianId_guardians_id_fk" FOREIGN KEY ("guardianId") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdBy_local_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."local_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_logs_guardian_idx" ON "alert_logs" USING btree ("guardianId");--> statement-breakpoint
CREATE INDEX "alert_logs_sent_at_idx" ON "alert_logs" USING btree ("sentAt");--> statement-breakpoint
CREATE INDEX "daily_closures_status_idx" ON "daily_closures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "guardians_name_idx" ON "guardians" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_quotas_pair_idx" ON "payment_quotas" USING btree ("paymentId","quotaId");--> statement-breakpoint
CREATE INDEX "payment_quotas_quota_idx" ON "payment_quotas" USING btree ("quotaId");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_idx" ON "payments" USING btree ("receiptNumber");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("paymentDate");--> statement-breakpoint
CREATE INDEX "payments_guardian_idx" ON "payments" USING btree ("guardianId");--> statement-breakpoint
CREATE INDEX "payments_player_idx" ON "payments" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "players_guardian_idx" ON "players" USING btree ("guardianId");--> statement-breakpoint
CREATE INDEX "players_category_idx" ON "players" USING btree ("category");--> statement-breakpoint
CREATE INDEX "players_status_idx" ON "players" USING btree ("status");--> statement-breakpoint
CREATE INDEX "players_name_idx" ON "players" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "quotas_player_period_idx" ON "quotas" USING btree ("playerId","year","month");--> statement-breakpoint
CREATE INDEX "quotas_status_idx" ON "quotas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotas_due_date_idx" ON "quotas" USING btree ("dueDate");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");