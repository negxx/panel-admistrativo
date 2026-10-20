import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Hourglass,
  LogOut,
  User,
  Users,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatMoney, formatPeriod, initials } from "@/lib/format";

/**
 * Portal de socios.
 *
 * Toda la información sale de un único endpoint autenticado por cookie
 * (`portal.dashboard`). El frontend ya no manda ningún id de socio: antes lo
 * leía de `localStorage` y cualquiera podía cambiarlo para ver la cuenta de otra
 * familia.
 *
 * El botón de pagar **informa** un pago, no lo da por cobrado: la cuota queda
 * "en revisión" hasta que el club confirma que la plata llegó.
 */
export default function PortalDashboard() {
  const navigate = useNavigate();
  const [payDialog, setPayDialog] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [method, setMethod] = useState<"transfer" | "mercadopago">("transfer");
  const [reference, setReference] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.portal.dashboard.useQuery(undefined, { retry: false });

  const logout = trpc.portal.logout.useMutation({
    onSuccess: async () => {
      await utils.portal.invalidate();
      navigate("/portal");
    },
  });

  const reportPayment = trpc.portal.reportPayment.useMutation({
    onSuccess: () => {
      toast.success("¡Listo! Informamos tu pago al club. Te avisamos cuando lo confirmen.");
      setPayDialog(false);
      setSelected([]);
      setReference("");
      utils.portal.dashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Si la sesión venció o no existe, vuelve al login.
  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") navigate("/portal", { replace: true });
  }, [error, navigate]);

  const payableQuotas = useMemo(
    () =>
      (data?.members ?? []).flatMap((member) =>
        member.pendingQuotas
          .filter((quota) => !quota.awaitingReview)
          .map((quota) => ({ ...quota, playerName: member.name })),
      ),
    [data],
  );

  const selectedTotal = payableQuotas
    .filter((q) => selected.includes(q.id))
    .reduce((sum, q) => sum + q.totalAmount, 0);

  if (isLoading) {
    return <p className="py-12 text-center text-white/70">Cargando tu cuenta…</p>;
  }
  if (!data) return null;

  const isGuardian = data.account.kind === "guardian";

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar"),
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Hola, {data.account.name}</h2>
          <p className="text-white/70">
            {isGuardian ? "Cuotas de tu familia" : "Tus cuotas del club"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => logout.mutate()}
        >
          <LogOut className="mr-1 h-4 w-4" /> Salir
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="rounded-2xl border-white/10 bg-white/[0.06] text-white shadow-pop backdrop-blur-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--club-accent-soft)] p-2 text-[var(--club-accent)]">
                {isGuardian ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm text-white/60">{isGuardian ? "Socios a cargo" : "Categoría"}</p>
                <p className="text-xl font-bold">
                  {isGuardian ? data.members.length : (data.members[0]?.category ?? "—")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/10 bg-white/[0.06] text-white shadow-pop backdrop-blur-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-400/15 p-2">
                <AlertCircle className="h-5 w-5 text-red-300" />
              </div>
              <div>
                <p className="text-sm text-white/60">A pagar</p>
                <p className="tabular text-xl font-bold">{formatMoney(data.totalPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.hasPendingReview && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/15 p-4 text-sm text-amber-200">
          <Hourglass className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Tenés un pago en revisión</p>
            <p className="text-amber-200/80">
              Ya recibimos tu aviso. Cuando el club verifique la transferencia, la cuota va a figurar
              como pagada.
            </p>
          </div>
        </div>
      )}

      {payableQuotas.length > 0 && (
        <Button
          className="h-14 w-full rounded-xl text-lg font-bold transition-all hover:opacity-90"
          style={{
            background: `linear-gradient(90deg, var(--club-accent-light), var(--club-accent))`,
            color: "var(--club-accent-contrast)",
            boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
          }}
          onClick={() => setPayDialog(true)}
        >
          <CreditCard className="mr-2 h-5 w-5" /> Pagar cuotas
        </Button>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight text-white">
          {isGuardian ? "Socios a cargo" : "Mis cuotas"}
        </h3>

        {data.members.map((member) => (
          <Card key={member.id} className="rounded-2xl border-white/10 bg-white/[0.06] shadow-pop backdrop-blur-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--club-accent-soft)] text-sm font-bold text-[var(--club-accent)]">
                    {initials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base text-white">{member.name}</CardTitle>
                    <p className="text-xs text-white/50">
                      Categoría {member.category} · DNI {member.dni}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    member.totalPending > 0
                      ? "border-red-400/25 bg-red-400/15 text-red-300"
                      : "border-emerald-400/25 bg-emerald-400/15 text-emerald-300"
                  }
                >
                  {member.totalPending > 0 ? formatMoney(member.totalPending) : "Al día"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {member.pendingQuotas.length === 0 ? (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Todas las cuotas están al día</span>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {member.pendingQuotas.map((quota) => (
                    <div
                      key={quota.id}
                      className="flex items-center justify-between gap-2 px-2 py-2 text-xs transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        {quota.status === "overdue" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-300" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-amber-300" />
                        )}
                        <span>{formatPeriod(quota.month, quota.year)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-white/50 sm:inline">
                          Vence {formatDate(quota.dueDate)}
                        </span>
                        {quota.awaitingReview ? (
                          <span className="flex items-center gap-1.5 text-white/70">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                            En revisión
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-white/70">
                            <span
                              className={
                                quota.status === "overdue"
                                  ? "h-1.5 w-1.5 rounded-full bg-red-300"
                                  : "h-1.5 w-1.5 rounded-full bg-amber-200"
                              }
                            />
                            {quota.status === "overdue" ? "Vencida" : "Pendiente"}
                          </span>
                        )}
                        <span className="min-w-[70px] text-right font-semibold tabular text-white">
                          {formatMoney(quota.totalAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {member.pendingQuotas.some((q) => q.interestAmount > 0) && (
                    <p className="px-2 text-[11px] text-white/50">
                      Los importes vencidos incluyen intereses por mora.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.payments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight text-white">Historial de pagos</h3>
          <Card className="rounded-2xl border-white/10 bg-white/[0.06] shadow-pop backdrop-blur-md">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/50">
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Detalle</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]">
                        <td className="px-4 py-3 text-white/50">
                          {formatDate(payment.paymentDate)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-white/50">
                            {payment.detail
                              .map((d) => `${d.playerName} (${formatPeriod(d.month, d.year)})`)
                              .join(", ")}
                          </p>
                          {payment.receiptNumber && (
                            <p className="font-mono text-[11px] text-white/40">
                              Recibo {payment.receiptNumber}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular text-white">
                          {formatMoney(payment.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          {payment.status === "confirmed" && (
                            <Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/15 text-emerald-300">
                              Confirmado
                            </Badge>
                          )}
                          {payment.status === "pending_review" && (
                            <Badge variant="outline" className="border-amber-400/25 bg-amber-400/15 text-amber-200">
                              En revisión
                            </Badge>
                          )}
                          {payment.status === "rejected" && (
                            <Badge variant="outline" className="border-white/10 bg-white/10 text-white/60">
                              Rechazado
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Informar pago */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto rounded-2xl border-white/10 text-white shadow-pop" style={{ backgroundColor: "var(--club-primary-dark)" }}>
          <DialogHeader>
            <DialogTitle>Informar un pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-white/70">Elegí las cuotas que estás pagando:</p>

            <div className="space-y-1.5">
              {payableQuotas.map((quota) => (
                <label
                  key={quota.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-xs transition-colors hover:bg-white/[0.09]"
                >
                  <Checkbox
                    className="border-white/25 bg-white/[0.07] data-[state=checked]:border-[var(--club-accent)] data-[state=checked]:bg-[var(--club-accent)]"
                    style={{ color: "var(--club-accent-contrast)" }}
                    checked={selected.includes(quota.id)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) =>
                        checked ? [...prev, quota.id] : prev.filter((id) => id !== quota.id),
                      )
                    }
                  />
                  <span className="flex-1">
                    {isGuardian && <strong>{quota.playerName} · </strong>}
                    {formatPeriod(quota.month, quota.year)}
                  </span>
                  <span className="min-w-[70px] text-right font-mono font-semibold">
                    {formatMoney(quota.totalAmount)}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <span className="font-semibold">Total</span>
              <span className="tabular text-xl font-bold">{formatMoney(selectedTotal)}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70">¿Cómo pagaste?</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger className="w-full rounded-xl border-white/15 bg-white/[0.07] text-white focus-visible:border-[var(--club-accent)] focus-visible:ring-[var(--club-accent-glow)] [&_svg]:text-white/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#101a3d] text-white shadow-pop">
                  <SelectItem value="transfer" className="focus:bg-white/10 focus:text-white">Transferencia bancaria</SelectItem>
                  <SelectItem value="mercadopago" className="focus:bg-white/10 focus:text-white">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === "transfer" && data.bank.bankCbu && (
              <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm">
                <p className="font-semibold text-white">Datos para transferir</p>
                <p className="text-white/70">Banco: {data.bank.bankName || "—"}</p>
                <p className="text-white/70">Titular: {data.bank.bankHolder || data.bank.clubName}</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-white/80">CBU: {data.bank.bankCbu}</span>
                  <button
                    type="button"
                    onClick={() => copy(data.bank.bankCbu, "CBU")}
                    className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-[var(--club-accent)]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                {data.bank.bankAlias && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-white/80">
                      Alias: {data.bank.bankAlias}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(data.bank.bankAlias, "Alias")}
                      className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-[var(--club-accent)]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-white/70">Número de comprobante</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Opcional, pero ayuda a encontrar tu pago"
                className="rounded-xl border-white/15 bg-white/[0.07] text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
              />
            </div>

            <p className="rounded-xl border border-amber-400/25 bg-amber-400/15 p-3 text-xs text-amber-200">
              Al enviar, el club revisa la transferencia y confirma el pago. Recién ahí la cuota
              figura como pagada.
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-white/15 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setPayDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                className="rounded-xl font-semibold transition-all hover:opacity-90"
                style={{
                  background: `linear-gradient(90deg, var(--club-accent-light), var(--club-accent))`,
                  color: "var(--club-accent-contrast)",
                  boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
                }}
                disabled={selected.length === 0 || reportPayment.isPending}
                onClick={() =>
                  reportPayment.mutate({
                    quotaIds: selected,
                    paymentMethod: method,
                    reference: reference || undefined,
                  })
                }
              >
                {reportPayment.isPending ? "Enviando…" : "Informar pago"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
