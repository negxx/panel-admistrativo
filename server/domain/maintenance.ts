import { getDb } from "../queries/connection";
import { syncOverdueQuotas } from "./quotas";
import { purgeExpiredAttempts } from "../lib/rate-limit";

/**
 * Tareas periódicas del sistema. Las dispara el cron una vez por día.
 *
 * Con SQLite y un servidor único, marcar vencimientos en cada consulta salía
 * gratis. Contra Postgres remoto cada consulta es un viaje por red, así que el
 * trabajo pesado se concentra acá.
 *
 * `syncOverdueQuotas` sigue corriendo también en las consultas que dependen de
 * datos frescos (lista de cuotas, deudores, portal): es idempotente y barata
 * cuando no hay nada para cambiar.
 */
export async function runMaintenance() {
  const db = getDb();

  const quotas = await syncOverdueQuotas(db);
  const purgedAttempts = await purgeExpiredAttempts(db);

  return {
    markedOverdue: quotas.markedOverdue,
    interestUpdated: quotas.interestUpdated,
    purgedAttempts,
  };
}
