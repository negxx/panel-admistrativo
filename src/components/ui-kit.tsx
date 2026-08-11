import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/**
 * Piezas visuales que se repiten en todas las pantallas del panel.
 * Están acá para que las páginas queden cortas y todas se vean igual.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-[#1a1a2e]">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger";
  hint?: string;
}) {
  const tones = {
    neutral: "bg-blue-50 text-blue-600",
    positive: "bg-green-50 text-green-600",
    warning: "bg-orange-50 text-orange-600",
    danger: "bg-red-50 text-red-600",
  } as const;

  const valueTones = {
    neutral: "text-[#1a1a2e]",
    positive: "text-green-600",
    warning: "text-orange-600",
    danger: "text-red-600",
  } as const;

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={cn("truncate text-xl font-bold font-mono", valueTones[tone])}>{value}</p>
            {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
          </div>
          {icon && <div className={cn("rounded-lg p-2", tones[tone])}>{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function MoneyStat(props: Omit<Parameters<typeof StatCard>[0], "value"> & { amount: number }) {
  const { amount, ...rest } = props;
  return <StatCard {...rest} value={formatMoney(amount)} />;
}

/** Fila vacía para tablas, con un mensaje claro en vez de una tabla en blanco. */
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-gray-400">
        {message}
      </td>
    </tr>
  );
}

/** Filas grises animadas mientras carga la tabla. */
export function LoadingRows({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-50">
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-4 animate-pulse rounded bg-gray-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

const quotaStatusStyles: Record<string, string> = {
  paid: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-orange-100 text-orange-700 border-orange-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
};

const quotaStatusLabels: Record<string, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  overdue: "Vencida",
};

export function QuotaStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs", quotaStatusStyles[status])}>
      {quotaStatusLabels[status] ?? status}
    </Badge>
  );
}

const paymentStatusStyles: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  rejected: "bg-gray-100 text-gray-600 border-gray-200",
};

const paymentStatusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  pending_review: "A confirmar",
  rejected: "Rechazado",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs", paymentStatusStyles[status])}>
      {paymentStatusLabels[status] ?? status}
    </Badge>
  );
}

const methodLabels: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
};

export function MethodLabel({ method }: { method: string | null }) {
  return <span>{method ? (methodLabels[method] ?? method) : "—"}</span>;
}

/** Paginador simple para las tablas del panel. */
export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
      <span className="text-gray-500">
        {total} resultado{total === 1 ? "" : "s"} · página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
