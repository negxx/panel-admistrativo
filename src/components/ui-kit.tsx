import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const statTones = {
  neutral: {
    tile: "bg-info/10 text-info",
    value: "text-foreground",
  },
  positive: {
    tile: "bg-success/10 text-success",
    value: "text-success",
  },
  warning: {
    tile: "bg-warning/10 text-warning",
    value: "text-warning",
  },
  danger: {
    tile: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
} as const;

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
  const toneStyle = statTones[tone];

  return (
    <Card className="group gap-0 rounded-xl border-border/70 py-0 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <p className={cn("tabular mt-1 truncate text-2xl font-bold tracking-tight", toneStyle.value)}>
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
              toneStyle.tile,
            )}
          >
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MoneyStat(props: Omit<Parameters<typeof StatCard>[0], "value"> & { amount: number }) {
  const { amount, ...rest } = props;
  return <StatCard {...rest} value={formatMoney(amount)} />;
}

/** Estado vacío con icono, para tarjetas y secciones. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <span className="text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Fila vacía para tablas, con un mensaje claro en vez de una tabla en blanco. */
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState icon={<Inbox />} title={message} />
      </td>
    </tr>
  );
}

/** Filas grises animadas mientras carga la tabla. */
export function LoadingRows({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border/50">
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-4 animate-pulse rounded-md bg-muted" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Punto de color + etiqueta: el patrón de todos los badges de estado. */
function StatusDot({ className }: { className: string }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full", className)} />;
}

const quotaStatusStyles: Record<string, { badge: string; dot: string; label: string }> = {
  paid: {
    badge: "border-success/25 bg-success/10 text-success",
    dot: "bg-success",
    label: "Pagada",
  },
  pending: {
    badge: "border-warning/25 bg-warning/10 text-warning",
    dot: "bg-warning",
    label: "Pendiente",
  },
  overdue: {
    badge: "border-destructive/25 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    label: "Vencida",
  },
};

const quotaStatusLabels: Record<string, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  overdue: "Vencida",
};

export function QuotaStatusBadge({ status }: { status: string }) {
  const style = quotaStatusStyles[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", style ? style.badge : "text-muted-foreground")}
    >
      <StatusDot className={style?.dot ?? "bg-muted-foreground"} />
      {quotaStatusLabels[status] ?? status}
    </Badge>
  );
}

const paymentStatusStyles: Record<string, { badge: string; dot: string }> = {
  confirmed: {
    badge: "border-success/25 bg-success/10 text-success",
    dot: "bg-success",
  },
  pending_review: {
    badge: "border-warning/25 bg-warning/10 text-warning",
    dot: "bg-warning",
  },
  rejected: {
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

const paymentStatusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  pending_review: "A confirmar",
  rejected: "Rechazado",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const style = paymentStatusStyles[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", style ? style.badge : "text-muted-foreground")}
    >
      <StatusDot className={style?.dot ?? "bg-muted-foreground"} />
      {paymentStatusLabels[status] ?? status}
    </Badge>
  );
}

const methodLabels: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
};

const methodIcons: Record<string, ReactNode> = {
  cash: <Banknote className="h-3.5 w-3.5" />,
  transfer: <ArrowLeftRight className="h-3.5 w-3.5" />,
  mercadopago: <CreditCard className="h-3.5 w-3.5" />,
};

export function MethodLabel({ method }: { method: string | null }) {
  if (!method) return <span className="text-muted-foreground">—</span>;
  const label = methodLabels[method] ?? method;
  const icon = methodIcons[method];
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      {label}
    </span>
  );
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {total} resultado{total === 1 ? "" : "s"} · página {page} de {totalPages}
      </span>
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
