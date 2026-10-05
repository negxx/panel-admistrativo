import path from "node:path";
import { existsSync, rmSync } from "node:fs";

/**
 * Bot de WhatsApp propio, sobre Baileys.
 *
 * Baileys automatiza un WhatsApp común escaneando un QR, como hace WhatsApp
 * Web. No es la API oficial de Meta: es gratis y no pide plantillas aprobadas,
 * pero técnicamente viola los términos de servicio de WhatsApp y el número
 * puede ser bloqueado. Para el club conviene usar un número secundario, no el
 * principal de nadie.
 *
 * **Sólo funciona en un proceso Node persistente** (`npm run dev`,
 * `npm start`, un VPS). En Vercel no —serverless no sostiene el socket— y por
 * eso este módulo se importa de forma lazy desde el router: si nadie usa el
 * bot, la app no lo carga ni rompe en serverless.
 *
 * El estado de sesión queda en `.wa-auth/` (ignorado por git): mientras esa
 * carpeta exista, el bot reconecta solo sin pedir el QR otra vez.
 */

const AUTH_DIR = path.resolve(process.cwd(), ".wa-auth");

type Wasocket = import("@whiskeysockets/baileys").WASocket;

type BotState = {
  socket: Wasocket | null;
  /** Estado de conexión tal como lo reporta Baileys. */
  connected: boolean;
  /** Número del bot, una vez vinculado. */
  phone: string | null;
  /** Último QR emitido, para mostrarlo en el panel. Se renueva cada ~30s. */
  qr: string | null;
  /** Mensaje de error si la conexión cayó. */
  lastError: string | null;
};

const state: BotState = {
  socket: null,
  connected: false,
  phone: null,
  qr: null,
  lastError: null,
};

/** Arranque en curso, para no abrir dos sockets si dos requests piden conectar. */
let starting: Promise<void> | null = null;

/** Mensaje entrante, ya filtrado de grupos/broadcast y del propio bot. */
export type IncomingMessage = {
  /** Número del remitente, tal como viene en el JID (`54911...@s.whatsapp.net`). */
  jid: string;
  text: string;
};

/**
 * Quien se ocupa de responder los mensajes entrantes (el asistente).
 * El servicio de WhatsApp no sabe de IA ni de la base: sólo avisa que llegó
 * texto y ofrece `sendText` para contestar.
 */
let incomingHandler: ((msg: IncomingMessage) => void) | null = null;

export function setIncomingHandler(handler: ((msg: IncomingMessage) => void) | null): void {
  incomingHandler = handler;
}

async function start(): Promise<void> {
  if (state.socket) return;

  console.log("[whatsapp] cargando baileys…");
  const baileys = await import("@whiskeysockets/baileys");
  const pino = (await import("pino")).default;

  console.log("[whatsapp] leyendo estado de sesión…");
  const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(AUTH_DIR);
  console.log("[whatsapp] consultando versión de WhatsApp…");
  const { version } = await baileys.fetchLatestBaileysVersion();
  console.log("[whatsapp] versión", version.join("."), "- abriendo socket…");

  const socket = baileys.default({
    version,
    auth: authState,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
  });

  state.socket = socket;
  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" || !incomingHandler) return;
    for (const msg of messages) {
      // Sin texto, de grupos, broadcast o enviados por el propio bot: afuera.
      if (msg.key.fromMe || !msg.key.remoteJid || msg.key.remoteJid.includes("@g.us"))
        continue;
      const text =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
      if (!text) continue;
      // WhatsApp reemplazó en parte el JID teléfono por un identificador
      // opaco ("@lid"); el número real llega en remoteJidAlt.
      const phoneJid =
        msg.key.remoteJid.endsWith("@lid") && msg.key.remoteJidAlt
          ? msg.key.remoteJidAlt
          : msg.key.remoteJid;
      incomingHandler({ jid: phoneJid, text: text.trim() });
    }
  });

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) state.qr = qr;

    if (connection === "open") {
      state.connected = true;
      state.qr = null;
      state.lastError = null;
      state.phone = socket.user?.id?.split(":")[0] ?? null;
    }

    if (connection === "close") {
      state.connected = false;
      state.phone = null;
      state.socket = null;

      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = statusCode === baileys.DisconnectReason.loggedOut;
      const replaced = statusCode === baileys.DisconnectReason.connectionReplaced;

      if (loggedOut) {
        // La sesión es inválida: hay que borrarla y volver a escanear el QR.
        state.lastError = "La sesión fue cerrada. Volvé a vincular con el QR.";
        if (existsSync(AUTH_DIR)) rmSync(AUTH_DIR, { recursive: true, force: true });
      } else if (replaced) {
        // Otra instancia (p. ej. un socket viejo del dev-server) tomó la
        // sesión. Reconectar en loop haría ping-pong entre los dos: cortamos
        // acá y se vuelve a intentar manualmente o al reiniciar el proceso.
        state.lastError = "Otra instancia tomó la sesión de WhatsApp. Reintentá conectar.";
      } else {
        state.lastError = null;
        // Reconexión automática: Baileys no reintenta por su cuenta.
        setTimeout(() => void connect(), 3000);
      }
    }
  });
}

/** Asegura que el bot está arrancado (o arrancándose). Devuelve el estado. */
export async function connect(): Promise<BotState> {
  if (!starting) {
    console.log("[whatsapp] connect() llamado");
    starting = start()
      .then(async () => {
        // El asistente que responde mensajes se arma al conectar el bot.
        // Import dinámico para no arrastrarlo a serverless ni a los tests.
        const { armAssistant } = await import("./wa-assistant");
        armAssistant();
      })
      .catch((err) => {
        state.lastError = err instanceof Error ? err.message : String(err);
        console.error("[whatsapp] error al conectar:", err);
      })
      .finally(() => {
        starting = null;
      });
  }
  await starting;
  return getStatus();
}

export function getStatus(): BotState {
  return { ...state };
}

export async function disconnect(): Promise<void> {
  try {
    await state.socket?.logout();
  } catch {
    // Si ya estaba caído, no hay nada que cerrar.
  }
  state.socket?.end(undefined);
  state.socket = null;
  state.connected = false;
  state.phone = null;
  state.qr = null;
}

/**
 * Convierte un teléfono argentino al JID de WhatsApp (`<num>@s.whatsapp.net`).
 *
 * Los socios cargan el número en formato nacional (`11 2345-6789`,
 * `11 15 2345-6789`, incluso con el 0 adelante). WhatsApp quiere el formato
 * internacional de celular: `54` + `9` + área + número, **sin** el 15.
 * Si el número ya viene con 54 se confía en que está bien cargado.
 *
 * Limitación conocida y deliberada: no se normalizan números de otros países.
 */
export function toJid(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("54")) return `${digits}@s.whatsapp.net`;
  if (digits.startsWith("0")) digits = digits.slice(1);
  // "11 15 2345-6789" → "1123456789": el 15 del formato nacional no existe
  // en el internacional.
  digits = digits.replace(/^(\d{2,4})15(\d+)$/, "$1$2");
  return `549${digits}@s.whatsapp.net`;
}

/** Manda un texto a un número usando el WhatsApp vinculado del club. */
export async function sendText(rawPhone: string, text: string): Promise<void> {
  await connect();
  if (!state.socket || !state.connected) {
    throw new Error("El bot de WhatsApp no está conectado. Vinculalo con el QR desde Deudores.");
  }

  await state.socket.sendMessage(toJid(rawPhone), { text });
}
