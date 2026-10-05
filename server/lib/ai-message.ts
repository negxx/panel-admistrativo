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
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

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

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
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
        `Sos el asistente de WhatsApp de la secretaría de ${params.clubName}, un club de ` +
        "fútbol de barrio argentino. Respondés en español rioplatense, cordial y corto " +
        "(máximo 6 líneas). Reglas que NUNCA se rompen:\n" +
        "- Sólo hablás de los datos del contexto que te pasan; nunca inventes montos, " +
        "cuotas, horarios ni datos de otras personas.\n" +
        "- NUNCA confirmes un pago por chat: si dicen que pagaron, indicales que lo " +
        "avisen desde el portal de socios con su DNI o que manden el comprobante a " +
        "secretaría.\n" +
        "- Si preguntan algo que no está en el contexto (cambio de categoría, horarios, " +
        "torneos, etc.), respondé amablemente que se acerquen a la secretaría del club.\n" +
        `- Datos para pagar por transferencia: ${params.bankInfo}\n\n` +
        `Contexto del remitente:\n${params.context}`,
    },
    ...params.history,
    { role: "user", content: params.userText },
  ]);
}
