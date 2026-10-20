import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { getDb } from "../queries/connection";
import { syncOverdueQuotas } from "../domain/quotas";
import { getSettings, type ClubSettings } from "../domain/settings";
import { aiIsConfigured, generateReply } from "../lib/ai-message";
import { MONTH_NAMES } from "../../contracts/constants";
import { sendText, setIncomingHandler, type IncomingMessage } from "./whatsapp";

/**
 * Asistente de WhatsApp: responde las consultas que le llegan al número del
 * club, con datos reales de la deuda del remitente, redactadas por la IA.
 *
 * Diseño deliberado:
 *
 * - **Identifica al remitente por teléfono** comparando los últimos 10 dígitos
 *   (tolerante al formato con 0, 15 o 549). Un número desconocido recibe una
 *   respuesta genérica y nunca datos de nadie.
 * - **La IA nunca confirma pagos**: la regla de oro del sistema (el pago se
 *   confirma en el panel/portal, no por chat) está en el prompt y además el
 *   asistente no toca la base más que para leer.
 * - **Historial corto en memoria** (últimos 6 mensajes por número): suficiente
 *   para una conversación coherente, no es estado que valga la pena guardar.
 * - **Límite de 20 respuestas por número cada 10 minutos**, para que un grupo
 *   travieso o un spam no queme la cuota gratis de Groq.
 * - Sin `GROQ_API_KEY` igual responde, con un texto fijo que deriva a la
 *   secretaría.
 */

type ChatEntry = { role: "user" | "assistant"; content: string };

const histories = new Map<string, ChatEntry[]>();
const replyWindows = new Map<string, number[]>();

const MAX_HISTORY = 6;
/**
 * 5 respuestas cada 10 minutos cortaba la demo apenas quien mostraba hacía
 * un par de preguntas seguidas (y parecía que el bot se colgaba otra vez).
 * 20 sigue protegiendo la cuota gratis de Groq contra spam.
 */
const MAX_REPLIES = 20;
const WINDOW_MS = 10 * 60 * 1000;

function underRateLimit(phone: string): boolean {
  const now = Date.now();
  const hits = (replyWindows.get(phone) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_REPLIES) {
    replyWindows.set(phone, hits);
    return false;
  }
  hits.push(now);
  replyWindows.set(phone, hits);
  return true;
}

/** Los últimos 10 dígitos: lo que identifica un celular argentino. */
function lastTenDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("9") && digits.length > 10) digits = digits.slice(1);
  digits = digits.replace(/^(\d{2,4})15(\d+)$/, "$1$2");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

type Account = {
  kind: "guardian" | "player";
  id: number;
  name: string;
};

/**
 * Busca a qué cuenta del club corresponde un teléfono. Compara por los
 * últimos 10 dígitos porque en la base el número puede estar con o sin 0/15/54.
 */
export function findAccount(
  candidates: Array<{ kind: "guardian" | "player"; id: number; name: string; phone: string | null }>,
  incomingPhone: string,
): Account | null {
  const target = lastTenDigits(incomingPhone);
  if (!target) return null;
  for (const candidate of candidates) {
    if (candidate.phone && lastTenDigits(candidate.phone) === target) {
      return { kind: candidate.kind, id: candidate.id, name: candidate.name };
    }
  }
  return null;
}

/** Arma el contexto de deuda que se le pasa a la IA. */
async function buildContext(
  account: Account | null,
  settings: ClubSettings,
): Promise<string> {
  const bankInfo = settings.bankAlias
    ? `alias ${settings.bankAlias} (${settings.bankHolder}, ${settings.bankName})`
    : "consultar en secretaría";

  const db = getDb();
  if (!account) {
    return `Número no registrado en el club. Datos bancarios: ${bankInfo}.`;
  }

  await syncOverdueQuotas(db);
  const quotas = await db
    .select({
      month: schema.quotas.month,
      year: schema.quotas.year,
      totalAmount: schema.quotas.totalAmount,
      playerName: schema.players.name,
    })
    .from(schema.quotas)
    .innerJoin(schema.players, eq(schema.quotas.playerId, schema.players.id))
    .where(
      and(
        account.kind === "guardian"
          ? eq(schema.players.guardianId, account.id)
          : eq(schema.players.id, account.id),
        inArray(schema.quotas.status, ["pending", "overdue"]),
      ),
    )
    .orderBy(schema.quotas.year, schema.quotas.month);

  const total = quotas.reduce((sum, q) => sum + q.totalAmount, 0);
  const detail = quotas
    .map(
      (q) =>
        `- ${MONTH_NAMES[q.month - 1]} ${q.year} (${q.playerName}): $${q.totalAmount.toLocaleString("es-AR")}`,
    )
    .join("\n");

  return (
    `Socio: ${account.name} (${account.kind === "guardian" ? "tutor" : "socio sin tutor"}).\n` +
    (quotas.length
      ? `Cuotas pendientes:\n${detail}\nDeuda total: $${total.toLocaleString("es-AR")} (incluye intereses).\n`
      : "No tiene cuotas pendientes: está al día.\n") +
    `Día de vencimiento de las cuotas: ${settings.dueDay} de cada mes.\n` +
    `Datos bancarios: ${bankInfo}.`
  );
}

function fallbackReply(account: Account | null, settings: ClubSettings): string {
  const name = account ? ` ${account.name}` : "";
  return (
    `Hola${name}! Este es un aviso automático de *${settings.clubName}*. ` +
    "Por consultas escribinos o acercate a la secretaría del club. ¡Gracias!"
  );
}

/**
 * Procesa las etiquetas de acción que la IA agrega al final del mensaje.
 *
 * `quotaIds` es `NOT NULL` en la tabla y acá no hay cuotas que asociar, así que
 * hay que pasarle un JSON vacío: sin eso el insert falla siempre. Y como esta
 * función corre "en segundo plano" (se la invoca con `void`), un error acá se
 * volvería un rechazo no manejado que tira abajo todo el proceso: va envuelto
 * en su propio try/catch.
 */
async function processActions(account: Account | null, text: string, phone: string) {
  const db = getDb();

  const log = (values: {
    guardianId: number | null;
    playerId: number | null;
    message: string;
  }) =>
    db
      .insert(schema.alertLogs)
      .values({ ...values, quotaIds: JSON.stringify([]), status: "prepared" })
      .catch((err) => console.error("[wa-assistant] error registrando acción:", err));

  // 1. Informar Pago
  if (text.includes("[ACTION: INFORM_PAYMENT]")) {
    if (account) {
      await log({
        guardianId: account.kind === "guardian" ? account.id : null,
        playerId: account.kind === "player" ? account.id : null,
        message: `El socio informó un pago vía WhatsApp. Verificar comprobante.`,
      });
    }
  }

  // 2. Pedir Baja
  if (text.includes("[ACTION: REQUEST_LOW]")) {
    if (account) {
      await log({
        guardianId: account.kind === "guardian" ? account.id : null,
        playerId: account.kind === "player" ? account.id : null,
        message: `El socio solicitó la baja vía WhatsApp.`,
      });
    }
  }

  // 3. Consultar Alta / Nuevo Socio
  if (text.includes("[ACTION: JOIN_CLUB]")) {
    await log({
      guardianId: null,
      playerId: null,
      message: `Persona desconocida (${phone}) consultó cómo hacerse socio vía WhatsApp.`,
    });
  }
}

export async function handleMessageFromPhone(phone: string, text: string): Promise<string | null> {
  if (!underRateLimit(phone)) return null;

  try {
    const db = getDb();
    const settings = await getSettings(db);

    const [guardians, players] = await Promise.all([
      db
        .select({ id: schema.guardians.id, name: schema.guardians.name, phone: schema.guardians.phone })
        .from(schema.guardians),
      db
        .select({ id: schema.players.id, name: schema.players.name, phone: schema.players.phone })
        .from(schema.players),
    ]);

    const account = findAccount(
      [
        ...guardians.map((g) => ({ ...g, kind: "guardian" as const })),
        ...players.map((p) => ({ ...p, kind: "player" as const })),
      ],
      phone,
    );

    console.log(`[wa-assistant] Teléfono ${phone} → ${account ? `${account.kind} "${account.name}" (id=${account.id})` : "NO REGISTRADO"}`);

    const history = histories.get(phone) ?? [];
    history.push({ role: "user", content: text });

    let reply: string;
    if (aiIsConfigured()) {
      const context = await buildContext(account, settings);
      const bankInfo = settings.bankAlias
        ? `alias ${settings.bankAlias} (${settings.bankHolder}, ${settings.bankName})`
        : "no hay datos bancarios cargados: derivar a secretaría";
      reply =
        (await generateReply({
          clubName: settings.clubName,
          bankInfo,
          context,
          history: history.slice(-MAX_HISTORY),
          userText: text,
        })) ?? fallbackReply(account, settings);
    } else {
      reply = fallbackReply(account, settings);
    }

    // Procesar acciones en segundo plano
    void processActions(account, reply, phone);

    // Limpiar etiquetas de acción para el usuario final
    const cleanReply = reply
      .replace(/\[ACTION: INFORM_PAYMENT\]/g, "")
      .replace(/\[ACTION: REQUEST_LOW\]/g, "")
      .replace(/\[ACTION: JOIN_CLUB\]/g, "")
      .trim();

    history.push({ role: "assistant", content: cleanReply });
    histories.set(phone, history.slice(-MAX_HISTORY));

    return cleanReply;
  } catch (err) {
    console.error("[wa-assistant] error respondiendo:", err);
    return null;
  }
}

async function handleIncoming(msg: IncomingMessage): Promise<void> {
  const phone = msg.jid.split("@")[0];
  const reply = await handleMessageFromPhone(phone, msg.text);
  if (reply) {
    await sendText(phone, reply);
  }
}

/** Engancha el asistente al bot. Idempotente. */
export function armAssistant(): void {
  setIncomingHandler((msg) => {
    void handleIncoming(msg);
  });
}

