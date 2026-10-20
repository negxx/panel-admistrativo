/**
 * WhatsApp Cloud API oficial de Meta.
 *
 * Funciona de manera serverless en Vercel sin necesidad de procesos persistentes
 * ni máquinas virtuales.
 *
 * Variables de entorno requeridas:
 * - WHATSAPP_ACCESS_TOKEN: Token generado en Meta for Developers.
 * - WHATSAPP_PHONE_NUMBER_ID: ID del número en Meta (ej: 1348700768331818).
 * - WHATSAPP_VERIFY_TOKEN: Token secreto que elegimos para validar el webhook con Meta.
 */

const GRAPH_API_VERSION = "v21.0";

export function getVerifyToken(): string {
  return process.env.WHATSAPP_VERIFY_TOKEN || "club_panel_secreto_2026";
}

/**
 * Valida la verificación de Webhook que Meta envía por GET.
 */
export function verifyWebhook(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  const expectedToken = getVerifyToken();
  if (mode === "subscribe" && token === expectedToken && challenge) {
    return challenge;
  }
  return null;
}

/**
 * Formato que Meta exige para Argentina: 54 + 9 + área + número, **sin el 15**
 * (https://faq.whatsapp.com/1294841057948784). Ojo: durante un tiempo la Cloud
 * API pedía lo contrario (sacar el 9), por eso había código que lo recortaba;
 * hoy enviar sin el 9 da error y el mensaje nunca sale.
 *
 * Acepta las cargas típicas del club:
 *   "11 2345-6789"     → 5491123456789
 *   "11 15 2345-6789"  → 5491123456789
 *   "011 15 2345-6789" → 5491123456789
 *   "5491123456789"    → 5491123456789 (ya viene bien)
 *
 * Los fijos (área + número de 8, sin celular) también quedan con 9: Meta los
 * rechaza igual porque WhatsApp sólo llega a móviles. Números de otros países
 * pasan tal cual si ya traen código de país.
 */
function normalizeArPhone(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, "");

  // Quita el 0 de "011 15 2345-6789".
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Quita el 15 del formato nacional: "111523456789" → "1123456789".
  digits = digits.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");

  if (digits.startsWith("54")) {
    // Con país: un celular cargado sin el 9 (5411... = 12 dígitos) lo lleva a 13.
    if (digits.length === 12) digits = `549${digits.slice(2)}`;
    return digits;
  }

  // Nacional de 10 dígitos (área + número de celular): agrega 54 y el 9.
  return digits.length === 10 ? `549${digits}` : digits;
}

/**
 * Envía un mensaje de texto usando la WhatsApp Cloud API de Meta.
 */
export async function sendCloudText(rawPhone: string, text: string): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1348700768331818";

  if (!accessToken) {
    console.error("[whatsapp-cloud] Error: Falta configurar WHATSAPP_ACCESS_TOKEN");
    return false;
  }

  const cleanPhone = normalizeArPhone(rawPhone);

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[whatsapp-cloud] Error enviando mensaje a Meta:", errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[whatsapp-cloud] Error de red enviando a Meta:", err);
    return false;
  }
}

/**
 * Extrae mensajes de texto entrantes de la carga útil del Webhook de Meta.
 */
export function extractIncomingMessages(body: any): Array<{ phone: string; text: string; messageId: string }> {
  const results: Array<{ phone: string; text: string; messageId: string }> = [];

  if (body?.object !== "whatsapp_business_account" || !Array.isArray(body?.entry)) {
    return results;
  }

  for (const entry of body.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (value?.messaging_product !== "whatsapp") continue;

      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        if (msg.type === "text" && msg.text?.body && msg.from) {
          results.push({
            phone: msg.from,
            text: msg.text.body.trim(),
            messageId: msg.id,
          });
        }
      }
    }
  }

  return results;
}
