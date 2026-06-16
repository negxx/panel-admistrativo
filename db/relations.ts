import { relations } from "drizzle-orm";
import { users, guardians, players, quotas, payments, paymentQuotas, transactions, alertLogs } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
}));

export const guardiansRelations = relations(guardians, ({ many }) => ({
  players: many(players),
  payments: many(payments),
  alertLogs: many(alertLogs),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  guardian: one(guardians, {
    fields: [players.guardianId],
    references: [guardians.id],
  }),
  quotas: many(quotas),
}));

export const quotasRelations = relations(quotas, ({ one, many }) => ({
  player: one(players, {
    fields: [quotas.playerId],
    references: [players.id],
  }),
  paymentQuotas: many(paymentQuotas),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  guardian: one(guardians, {
    fields: [payments.guardianId],
    references: [guardians.id],
  }),
  paymentQuotas: many(paymentQuotas),
}));

export const paymentQuotasRelations = relations(paymentQuotas, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentQuotas.paymentId],
    references: [payments.id],
  }),
  quota: one(quotas, {
    fields: [paymentQuotas.quotaId],
    references: [quotas.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  createdByUser: one(users, {
    fields: [transactions.createdBy],
    references: [users.id],
  }),
}));

export const alertLogsRelations = relations(alertLogs, ({ one }) => ({
  guardian: one(guardians, {
    fields: [alertLogs.guardianId],
    references: [guardians.id],
  }),
}));
