import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  DollarSign,
  MessageCircle,
  Receipt,
  Users,
} from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CobrarDialog, type CobrarPayer } from "@/components/CobrarDialog";
import { EmptyRow, MoneyStat, PageHeader, StatCard } from "@/components/ui-kit";
import { formatDateTime, formatMoney, formatShortPeriod } from "@/lib/format";

/**
 * Deudores y avisos por WhatsApp.
 *
 * Antes esta pantalla **siempre aparecía vacía**, porque filtraba por cuotas
 * vencidas y nada en el sistema las marcaba como tales. Además ignoraba a los
 * socios sin tutor, que nunca figuraban como morosos.
 *
 * El envío de WhatsApp es asistido: el sistema arma el texto y abre el chat, la
 * persona lo manda. Por eso el aviso se registra como "preparado" y se confirma
 * aparte, en vez de darlo por enviado sin que salga nada.
 */
export default function Deudores() {
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [selected, setSelected] = useState<{ kind: "guardian" | "player"; id: number } | null>(null);
  const [payer, setPayer] = useState<CobrarPayer | null>(null);

  const { data, isLoading } = trpc.alert.getDebtors.useQuery({ minAmount: 0, onlyOverdue });
  const { data: logs } = trpc.alert.getLogs.useQuery({ limit: 30 });

  // El texto del aviso lo arma el servidor con la deuda actualizada.
  const { data: prepared } = trpc.alert.buildMessage.useQuery(
    selected ?? { kind: "guardian", id: 0 },
    { enabled: selected !== null },
  );

  const debtors = data?.debtors ?? [];

  const todayAlerts = (logs ?? []).filter((log) => {
    if (!log.sentAt) return false;
    return new Date(log.sentAt).toDateString() === new Date().toDateString();
  }).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deudores y alertas"
        subtitle="Seguimiento de morosidad y avisos por WhatsApp"
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <Switch checked={onlyOverdue} onCheckedChange={setOnlyOverdue} />
            Sólo cuotas vencidas
          </label>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Deudores"
          value={debtors.length}
          icon={<Users className="h-5 w-5" />}
          tone={debtors.length > 0 ? "danger" : "positive"}
        />
        <MoneyStat
          label="Deuda total"
          amount={data?.totalDebt ?? 0}
          tone="danger"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Cuotas impagas"
          value={data?.totalQuotas ?? 0}
          icon={<Receipt className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Avisos de hoy"
          value={todayAlerts}
          icon={<Bell className="h-5 w-5" />}
        />
      </div>

      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-600">
                  <th className="px-4 py-3 font-semibold">Cuenta</th>
                  <th className="px-4 py-3 font-semibold">Cuotas adeudadas</th>
                  <th className="px-4 py-3 text-right font-semibold">Deuda</th>
                  <th className="px-4 py-3 font-semibold">Último aviso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      Cargando…
                    </td>
                  </tr>
                )}
                {!isLoading && debtors.length === 0 && (
                  <EmptyRow colSpan={5} message="No hay deudores. ¡Todo al día!" />
                )}
                {debtors.map((debtor) => (
                  <tr key={debtor.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{debtor.name}</p>
                      <p className="text-xs text-gray-400">
                        {debtor.kind === "guardian" ? "Tutor" : "Socio sin tutor"}
                        {debtor.phone ? ` · ${debtor.phone}` : " · sin teléfono"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {debtor.quotas.slice(0, 6).map((quota) => (
                          <Badge
                            key={quota.quotaId}
                            variant="outline"
                            className={
                              quota.status === "overdue"
                                ? "border-red-200 text-xs text-red-600"
                                : "border-orange-200 text-xs text-orange-600"
                            }
                          >
                            {formatShortPeriod(quota.month, quota.year)}
                          </Badge>
                        ))}
                        {debtor.quotas.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{debtor.quotas.length - 6}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {[...new Set(debtor.quotas.map((q) => q.playerName))].join(", ")}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">
                      {formatMoney(debtor.totalDebt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {debtor.lastAlertDate ? formatDateTime(debtor.lastAlertDate) : "Nunca"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!debtor.phone}
                          onClick={() => setSelected({ kind: debtor.kind, id: debtor.id })}
                        >
                          <MessageCircle className="mr-1 h-3.5 w-3.5" /> Avisar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setPayer({ kind: debtor.kind, id: debtor.id, name: debtor.name })
                          }
                        >
                          Cobrar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {logs && logs.length > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimos avisos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">{log.name}</p>
                  <p className="truncate text-xs text-gray-400">
                    {log.message.split("\n")[0]}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      log.status === "sent"
                        ? "border-green-200 text-xs text-green-700"
                        : "border-blue-200 text-xs text-blue-700"
                    }
                  >
                    {log.status === "sent" ? "Enviado" : "Preparado"}
                  </Badge>
                  <span className="text-xs text-gray-400">{formatDateTime(log.sentAt)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Preparar mensaje */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aviso de deuda{prepared ? ` — ${prepared.name}` : ""}</DialogTitle>
          </DialogHeader>
          {/* El editor se monta recién con el mensaje ya armado por el servidor,
              y lo toma como texto inicial. */}
          {selected && prepared ? (
            <AlertComposer
              target={selected}
              prepared={prepared}
              onDone={() => setSelected(null)}
            />
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">Armando el mensaje…</p>
          )}
        </DialogContent>
      </Dialog>

      <CobrarDialog
        payer={payer}
        open={payer !== null}
        onOpenChange={(open) => !open && setPayer(null)}
      />
    </div>
  );
}

type PreparedAlert = NonNullable<RouterOutputs["alert"]["buildMessage"]>;

/**
 * Editor del aviso. El envío es manual: se abre WhatsApp con el texto cargado y
 * la persona lo manda desde su teléfono, así que el aviso se registra como
 * "preparado".
 */
function AlertComposer({
  target,
  prepared,
  onDone,
}: {
  target: { kind: "guardian" | "player"; id: number };
  prepared: PreparedAlert;
  onDone: () => void;
}) {
  const [message, setMessage] = useState(prepared.message);
  const utils = trpc.useUtils();

  const logAlert = trpc.alert.logAlert.useMutation({
    onSuccess: () => {
      utils.alert.getLogs.invalidate();
      utils.alert.getDebtors.invalidate();
    },
  });

  const send = () => {
    if (!prepared.phone) {
      toast.error("Este deudor no tiene teléfono cargado");
      return;
    }
    window.open(
      `https://wa.me/${prepared.phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener",
    );
    logAlert.mutate({
      kind: target.kind,
      id: target.id,
      quotaIds: prepared.quotaIds,
      message,
      status: "prepared",
    });
    toast.success("Mensaje preparado en WhatsApp");
    onDone();
  };

  return (
    <div className="space-y-4 pt-2">
      {!prepared.phone && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Esta persona no tiene teléfono cargado. Completá el dato en su ficha.
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-sm text-gray-500">Podés editar el texto antes de abrir WhatsApp.</p>
        <Textarea
          rows={12}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
        <span>Deuda informada</span>
        <span className="font-mono font-semibold">{formatMoney(prepared.totalDebt)}</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={!prepared.phone}
          onClick={send}
        >
          <MessageCircle className="mr-1 h-4 w-4" /> Abrir WhatsApp
        </Button>
      </div>
    </div>
  );
}
