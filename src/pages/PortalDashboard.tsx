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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Hola, {data.account.name}</h2>
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
        <Card className="border-0 bg-white/10 text-white backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/10 p-2">
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
        <Card className="border-0 bg-white/10 text-white backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-500/20 p-2">
                <AlertCircle className="h-5 w-5 text-red-300" />
              </div>
              <div>
                <p className="text-sm text-white/60">A pagar</p>
                <p className="font-mono text-xl font-bold">{formatMoney(data.totalPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.hasPendingReview && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-400/20 p-4 text-sm text-amber-50">
          <Hourglass className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Tenés un pago en revisión</p>
            <p className="text-amber-100/80">
              Ya recibimos tu aviso. Cuando el club verifique la transferencia, la cuota va a figurar
              como pagada.
            </p>
          </div>
        </div>
      )}

      {payableQuotas.length > 0 && (
        <Button
          className="h-14 w-full bg-[#ffc107] text-lg font-bold text-[#1a237e] shadow-lg hover:bg-[#e6af06]"
          onClick={() => setPayDialog(true)}
        >
          <CreditCard className="mr-2 h-5 w-5" /> Pagar cuotas
        </Button>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">
          {isGuardian ? "Socios a cargo" : "Mis cuotas"}
        </h3>

        {data.members.map((member) => (
          <Card key={member.id} className="border-0 bg-white/95 backdrop-blur">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1a237e] text-sm font-bold text-white">
                    {initials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{member.name}</CardTitle>
                    <p className="text-xs text-gray-500">
                      Categoría {member.category} · DNI {member.dni}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    member.totalPending > 0
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  }
                >
                  {member.totalPending > 0 ? formatMoney(member.totalPending) : "Al día"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {member.pendingQuotas.length === 0 ? (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Todas las cuotas están al día</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {member.pendingQuotas.map((quota) => (
                    <div
                      key={quota.id}
                      className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {quota.status === "overdue" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        <span>{formatPeriod(quota.month, quota.year)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-gray-400 sm:inline">
                          Vence {formatDate(quota.dueDate)}
                        </span>
                        {quota.awaitingReview ? (
                          <Badge variant="outline" className="border-amber-200 text-amber-700">
                            En revisión
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={
                              quota.status === "overdue"
                                ? "border-red-200 text-red-600"
                                : "border-orange-200 text-orange-600"
                            }
                          >
                            {quota.status === "overdue" ? "Vencida" : "Pendiente"}
                          </Badge>
                        )}
                        <span className="min-w-[70px] text-right font-mono font-semibold">
                          {formatMoney(quota.totalAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {member.pendingQuotas.some((q) => q.interestAmount > 0) && (
                    <p className="px-2 text-[11px] text-gray-400">
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
          <h3 className="text-lg font-semibold text-white">Historial de pagos</h3>
          <Card className="border-0 bg-white/95 backdrop-blur">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-600">
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Detalle</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 text-gray-500">
                          {formatDate(payment.paymentDate)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-500">
                            {payment.detail
                              .map((d) => `${d.playerName} (${formatPeriod(d.month, d.year)})`)
                              .join(", ")}
                          </p>
                          {payment.receiptNumber && (
                            <p className="font-mono text-[11px] text-gray-400">
                              Recibo {payment.receiptNumber}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {formatMoney(payment.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          {payment.status === "confirmed" && (
                            <Badge variant="outline" className="border-green-200 text-green-700">
                              Confirmado
                            </Badge>
                          )}
                          {payment.status === "pending_review" && (
                            <Badge variant="outline" className="border-amber-200 text-amber-700">
                              En revisión
                            </Badge>
                          )}
                          {payment.status === "rejected" && (
                            <Badge variant="outline" className="border-gray-200 text-gray-500">
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
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Informar un pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">Elegí las cuotas que estás pagando:</p>

            <div className="space-y-1.5">
              {payableQuotas.map((quota) => (
                <label
                  key={quota.id}
                  className="flex cursor-pointer items-center gap-2 rounded bg-gray-50 px-2 py-1.5 text-xs"
                >
                  <Checkbox
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

            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <span className="font-semibold">Total</span>
              <span className="font-mono text-xl font-bold">{formatMoney(selectedTotal)}</span>
            </div>

            <div className="space-y-1.5">
              <Label>¿Cómo pagaste?</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferencia bancaria</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === "transfer" && data.bank.bankCbu && (
              <div className="space-y-1.5 rounded bg-blue-50 p-3 text-xs">
                <p className="font-semibold text-blue-800">Datos para transferir</p>
                <p>Banco: {data.bank.bankName || "—"}</p>
                <p>Titular: {data.bank.bankHolder || data.bank.clubName}</p>
                <div className="flex items-center gap-2">
                  <span>CBU: {data.bank.bankCbu}</span>
                  <button type="button" onClick={() => copy(data.bank.bankCbu, "CBU")}>
                    <Copy className="h-3.5 w-3.5 text-blue-600" />
                  </button>
                </div>
                {data.bank.bankAlias && (
                  <div className="flex items-center gap-2">
                    <span>Alias: {data.bank.bankAlias}</span>
                    <button type="button" onClick={() => copy(data.bank.bankAlias, "Alias")}>
                      <Copy className="h-3.5 w-3.5 text-blue-600" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Número de comprobante</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Opcional, pero ayuda a encontrar tu pago"
              />
            </div>

            <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
              Al enviar, el club revisa la transferencia y confirma el pago. Recién ahí la cuota
              figura como pagada.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayDialog(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
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
