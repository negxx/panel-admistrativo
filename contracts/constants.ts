/** Sesión del panel administrativo (secretaría / admin). */
export const Session = {
  cookieName: "kimi_sid",
  /**
   * 7 días. Antes era 1 año: una cookie robada servía indefinidamente y no
   * había forma de invalidarla.
   */
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  /** Mismo valor, en el formato que espera `jose`. */
  expiration: "7d",
} as const;

/** Sesión del portal público de socios. */
export const PortalSession = {
  cookieName: "club_portal_sid",
  /** 30 días: los socios entran poco (una vez por mes, a pagar). */
  maxAgeSeconds: 30 * 24 * 60 * 60,
  expiration: "30d",
} as const;

export const ErrorMessages = {
  unauthenticated: "Necesitás iniciar sesión",
  insufficientRole: "No tenés permisos para esta acción",
  portalUnauthenticated: "Necesitás ingresar con tu DNI y PIN",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

/** Estados posibles de una cuota. */
export const QuotaStatus = {
  /** Generada, todavía no vencida. */
  pending: "pending",
  /** Cobrada y confirmada. */
  paid: "paid",
  /** Pasó el vencimiento más los días de gracia y sigue impaga. */
  overdue: "overdue",
} as const;

/**
 * Estados de un pago.
 *
 * Los pagos que carga la secretaría nacen `confirmed`. Los que informa un socio
 * desde el portal (transferencia o MercadoPago) nacen `pending_review` y no
 * saldan la cuota hasta que alguien del club los confirma en el panel.
 */
export const PaymentStatus = {
  confirmed: "confirmed",
  pending_review: "pending_review",
  rejected: "rejected",
} as const;

/** Etiquetas en castellano para mostrar en pantalla. */
export const PaymentStatusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  pending_review: "A confirmar",
  rejected: "Rechazado",
};

export const PaymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
};

export const QuotaStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagada",
  overdue: "Vencida",
};

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Valor que usan los `<Select>` para decir "sin filtro". */
export const ALL_FILTER = "all";
