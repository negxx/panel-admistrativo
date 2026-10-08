/**
 * Generación de avisos de deuda con IA (Groq, capa gratuita).
 *
 * Groq expone una API compatible con OpenAI y tiene un free tier generoso que
 * no pide tarjeta: https://console.groq.com. Basta cargar GROQ_API_KEY en el
 * .env. El modelo por defecto es `llama-3.3-70b-versatile`.
 *
 * **Si no hay clave o la IA falla, se degrada en silencio a la plantilla fija**
 * (`buildWhatsAppMessage`): el aviso tiene que salir igual, siempre.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

async function chat(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 300,
        messages,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ai-message] Error de Groq:", err);
      return null;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[ai-message] Excepción al llamar a Groq:", err);
    return null;
  }
}

export function aiIsConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function generateDebtMessage(params: {
  clubName: string;
  name: string;
  quotas: Array<{ month: number; year: number; totalAmount: number; monthName: string }>;
  totalDebt: number;
}): Promise<string | null> {
  const detail = params.quotas
    .map((q) => `- ${q.monthName} ${q.year}: $${q.totalAmount.toLocaleString("es-AR")}`)
    .join("\n");

  return chat([
    {
      role: "system",
      content:
        "Sos la secretaría de un club de fútbol de barrio argentino. Escribís avisos " +
        "de deuda por WhatsApp: cordiales, claros y cortos (máximo 10 líneas), en " +
        "español rioplatense. Usá *negritas* de WhatsApp para el monto total. No " +
        "inventes datos: usás exactamente las cuotas y montos que te pasan. Cerrás " +
        "siempre avisando que se puede pagar en secretaría o por transferencia.",
    },
    {
      role: "user",
      content:
        `Club: ${params.clubName}\nDestinatario: ${params.name}\n` +
        `Cuotas pendientes:\n${detail}\n` +
        `Deuda total: $${params.totalDebt.toLocaleString("es-AR")} (incluye intereses)\n\n` +
        "Escribí el aviso completo, listo para enviar.",
    },
  ]);
}

/**
 * Respuesta conversacional del asistente de WhatsApp.
 *
 * Reglas duras (en el prompt, no en el código): sólo habla de la deuda y datos
 * bancarios **del remitente**, nunca confirma pagos por chat (eso pasa siempre
 * por el panel o el portal) y deriva cualquier otro tema a la secretaría.
 */
/**
 * Respuesta conversacional del asistente de WhatsApp.
 *
 * Ahora la IA actúa como un agente: redacta la respuesta y, si detecta que el
 * usuario quiere realizar una acción, agrega una etiqueta de comando al final.
 *
 * Comandos soportados:
 * - [ACTION: INFORM_PAYMENT]: El usuario quiere informar un pago.
 * - [ACTION: REQUEST_LOW]: El usuario quiere dar de baja a un socio.
 * - [ACTION: JOIN_CLUB]: El usuario quiere saber cómo hacerse socio.
 */
export async function generateReply(params: {
  clubName: string;
  bankInfo: string;
  context: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
}): Promise<string | null> {
  return chat([
    {
      role: "system",
      content:
        `Sos el asistente inteligente de la secretaría de ${params.clubName}, un club de ` +
        "fútbol de barrio argentino. Respondés en español rioplatense, natural, cercano y corto " +
        "(máximo 6 líneas). \n\n" +
        "TUS CAPACIDADES:\n" +
        "1. Consultas de deuda: Usá el contexto para dar montos exactos.\n" +
        "2. Informar pagos: Si el usuario dice que ya pagó o quiere informar un pago, " +
        "respondé amablemente y agregá al final la etiqueta [ACTION: INFORM_PAYMENT].\n" +
        "3. Bajas: Si quiere dar de baja a un hijo/socio, pedile el motivo y agregá [ACTION: REQUEST_LOW].\n" +
        "4. Altas: Si alguien quiere hacerse socio, explicale que es posible, pedile el nombre del chico " +
        "y la edad, y agregá [ACTION: JOIN_CLUB].\n\n" +
        "REGLAS DE ORO:\n" +
        "- NUNCA confirmes un pago como 'pagado'. Solo decí que 'lo registramos para que secretaría lo revise'.\n" +
        "- No inventes datos. Si no están en el contexto, derivá a secretaría.\n" +
        "- Si el usuario está enojado, mantené la calma y sé muy cordial.\n" +
        `- Datos bancarios: ${params.bankInfo}\n\n` +
        `Contexto del remitente:\n${params.context}`,
    },
    ...params.history,
    { role: "user", content: params.userText },
  ]);
}
