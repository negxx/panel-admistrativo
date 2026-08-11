import { relations } from "drizzle-orm";
import {
  localUsers,
  guardians,
  players,
  quotas,
  payments,
  paymentQuotas,
  transactions,
  alertLogs,
  dailyClosures,
} from "./schema";

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  transactions: many(transactions),
  paymentsCreated: many(payments),
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
  payments: many(payments),
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
  player: one(players, {
    fields: [payments.playerId],
    references: [players.id],
  }),
  reviewer: one(localUsers, {
    fields: [payments.reviewedBy],
    references: [localUsers.id],
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
  createdByUser: one(localUsers, {
    fields: [transactions.createdBy],
    references: [localUsers.id],
  }),
}));

export const alertLogsRelations = relations(alertLogs, ({ one }) => ({
  guardian: one(guardians, {
    fields: [alertLogs.guardianId],
    references: [guardians.id],
  }),
  player: one(players, {
    fields: [alertLogs.playerId],
    references: [players.id],
  }),
}));

export const dailyClosuresRelations = relations(dailyClosures, ({ one }) => ({
  openedByUser: one(localUsers, {
    fields: [dailyClosures.openedBy],
    references: [localUsers.id],
  }),
  closedByUser: one(localUsers, {
    fields: [dailyClosures.closedBy],
    references: [localUsers.id],
  }),
}));
