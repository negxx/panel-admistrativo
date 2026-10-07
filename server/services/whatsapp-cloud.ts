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
 * Envía un mensaje de texto usando la WhatsApp Cloud API de Meta.
 */
export async function sendCloudText(rawPhone: string, text: string): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1348700768331818";

  if (!accessToken) {
    console.error("[whatsapp-cloud] Error: Falta configurar WHATSAPP_ACCESS_TOKEN");
    return false;
  }

  // Limpiar el teléfono para dejar solo dígitos
  let cleanPhone = rawPhone.replace(/\D/g, "");
  // En Argentina: si viene con 549 (13 dígitos), Meta Cloud API requiere sacarle el 9: 54 + código de área + número
  if (cleanPhone.startsWith("549") && cleanPhone.length === 13) {
    cleanPhone = `54${cleanPhone.slice(3)}`;
  } else if (cleanPhone.length === 10) {
    cleanPhone = `54${cleanPhone}`;
  }

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
