import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState, MoneyStat, PageHeader, StatCard } from "@/components/ui-kit";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";

/**
 * Pagos informados desde el portal, esperando confirmación.
 *
 * Esta pantalla es el puente entre la web de socios y el CRM:
 *
 *  1. El socio entra al portal, elige sus cuotas y avisa que transfirió.
 *  2. El pago aparece acá, con el detalle de qué cuotas cubre y el número de
 *     comprobante que informó.
 *  3. La secretaría verifica en el homebanking y confirma o rechaza.
 *  4. Al confirmar, recién ahí se saldan las cuotas, se emite el recibo y el
 *     importe entra al cierre de caja del día.
 *
 * Antes esto no existía: el portal marcaba la cuota como pagada apenas el socio
 * apretaba el botón, sin que entrara un peso al club.
 */
export default function PagosPendientes() {
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.payment.pendingReview.useQuery();

  const confirm = trpc.payment.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(`Pago confirmado. Recibo ${result.receiptNumber}`);
      utils.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reject = trpc.payment.reject.useMutation({
    onSuccess: () => {
      toast.success("Pago rechazado. Las cuotas siguen pendientes.");
      setRejecting(null);
      setReason("");
      utils.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const payments = data?.payments ?? [];

  return (
    <div className="space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title="Pagos a confirmar"
        subtitle="Transferencias y pagos que informaron los socios desde el portal"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Esperando confirmación"
          value={payments.length}
          icon={<Clock className="h-5 w-5" />}
          tone={payments.length > 0 ? "warning" : "neutral"}
        />
        <MoneyStat
          label="Importe informado"
          amount={data?.totalAmount ?? 0}
          icon={<Inbox className="h-5 w-5" />}
        />
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && payments.length === 0 && (
        <Card className="rounded-xl border-border/70 py-0 shadow-card">
          <EmptyState
            icon={<CheckCircle2 />}
            title="No hay pagos esperando confirmación"
            hint="Cuando un socio informe una transferencia desde el portal, va a aparecer acá para que la verifiques antes de darla por cobrada."
          />
        </Card>
      )}

      <div className="space-y-3">
        {payments.map((payment) => (
          <Card key={payment.id} className="rounded-xl border-border/70 py-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{payment.payerName}</p>
                  <p className="text-sm text-muted-foreground">
                    Informado el {formatDate(payment.paymentDate)} ·{" "}
                    {payment.paymentMethod === "transfer" ? "Transferencia" : "MercadoPago"}
                  </p>
                  {payment.reference && (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Comprobante:</span>{" "}
                      <span className="tabular">{payment.reference}</span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="tabular text-xl font-bold">{formatMoney(payment.totalAmount)}</p>
                  {payment.phone && (
                    <a
                      href={`https://wa.me/${payment.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-success hover:underline"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Consultar
                    </a>
                  )}
                </div>
              </div>

              {payment.hasConflict && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    Alguna de estas cuotas ya figura cobrada por otra vía. Revisá antes de
                    confirmar: si ya se cobró en mostrador, este pago hay que rechazarlo.
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-border/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-3 py-2">Socio</th>
                      <th className="px-3 py-2">Período</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payment.quotas.map((quota) => (
                      <tr key={quota.quotaId} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">{quota.playerName}</td>
                        <td className="px-3 py-2">{formatPeriod(quota.month, quota.year)}</td>
                        <td className="px-3 py-2 text-right tabular">
                          {formatMoney(quota.totalAmount)}
                        </td>
                        <td className="px-3 py-2">
                          {quota.status === "paid" ? (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-destructive/25 bg-destructive/10 text-destructive"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                              Ya cobrada
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-warning/25 bg-warning/10 text-warning"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                              Pendiente
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setRejecting(payment.id)}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Rechazar
                </Button>
                <Button
                  size="sm"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate({ id: payment.id })}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Confirmar cobro
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar pago informado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Las cuotas van a seguir figurando como impagas y el socio va a poder volver a
              informarlas.
            </p>
            <div className="space-y-1.5">
              <Label>Motivo (queda registrado)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Ej: no figura la transferencia en el resumen"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={reject.isPending}
                onClick={() =>
                  rejecting && reject.mutate({ id: rejecting, reason: reason || undefined })
                }
              >
                Rechazar pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
