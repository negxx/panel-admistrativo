import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { dashboardRouter } from "./routers/dashboard-router";
import { playerRouter } from "./routers/player-router";
import { guardianRouter } from "./routers/guardian-router";
import { quotaRouter } from "./routers/quota-router";
import { paymentRouter } from "./routers/payment-router";
import { transactionRouter } from "./routers/transaction-router";
import { alertRouter } from "./routers/alert-router";
import { portalRouter } from "./routers/portal-router";
import { usersRouter } from "./routers/users-router";
import { closureRouter } from "./routers/closure-router";
import { categoryRouter } from "./routers/category-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  dashboard: dashboardRouter,
  player: playerRouter,
  guardian: guardianRouter,
  quota: quotaRouter,
  payment: paymentRouter,
  transaction: transactionRouter,
  alert: alertRouter,
  portal: portalRouter,
  users: usersRouter,
  closure: closureRouter,
  category: categoryRouter,
});

export type AppRouter = typeof appRouter;