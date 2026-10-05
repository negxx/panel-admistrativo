import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Bot,
  DollarSign,
  MessageCircle,
  Receipt,
  Send,
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
  const [botOpen, setBotOpen] = useState(false);

  const { data, isLoading } = trpc.alert.getDebtors.useQuery({ minAmount: 0, onlyOverdue });
  const { data: logs } = trpc.alert.getLogs.useQuery({ limit: 30 });
  // Mientras el diálogo del bot está abierto, el estado se refresca seguido
  // para que el QR nuevo y el "conectado" aparezcan apenas cambian.
  const { data: bot } = trpc.alert.whatsappStatus.useQuery(undefined, {
    refetchInterval: botOpen ? 2000 : 10000,
  });

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
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className={bot?.connected ? "border-green-200 text-green-700" : ""}
              onClick={() => setBotOpen(true)}
            >
              <Bot className="mr-1 h-4 w-4" />
              {bot?.connected ? `Bot +${bot.phone ?? ""}` : "Conectar bot"}
            </Button>
            <label className="flex items-center gap-2 text-sm text-gray-600">
            <Switch checked={onlyOverdue} onCheckedChange={setOnlyOverdue} />
            Sólo cuotas vencidas
          </label>
          </div>
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

      <BotDialog open={botOpen} onOpenChange={setBotOpen} />
    </div>
  );
}

/**
 * Vinculación del bot de WhatsApp del club. El QR lo provee el servidor
 * (Baileys) y acá se convierte a imagen con la librería `qrcode`.
 */
function BotDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: bot } = trpc.alert.whatsappStatus.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 2000 : false,
  });

  const connect = trpc.alert.whatsappConnect.useMutation({
    onSuccess: () => utils.alert.whatsappStatus.invalidate(),
  });

  // Al abrir el diálogo, el bot arranca solo: el QR aparece a los segundos sin
  // tener que tocar nada. El ref evita volver a dispararlo en cada refresco.
  const connectTried = useRef(false);
  useEffect(() => {
    if (!open || connectTried.current || !bot || bot.connected || bot.qr) return;
    connectTried.current = true;
    connect.mutate();
  }, [open, bot, connect]);
  const disconnect = trpc.alert.whatsappDisconnect.useMutation({
    onSuccess: () => {
      utils.alert.whatsappStatus.invalidate();
      // Al desvincular, la próxima apertura vuelve a pedir el QR sola.
      connectTried.current = false;
    },
  });

  useEffect(() => {
    if (!bot?.qr) {
      setQrImage(null);
      return;
    }
    // Renderizar el QR en el navegador evita mandarlo en claro como imagen.
    import("qrcode").then((qrcode) =>
      qrcode.toDataURL(bot.qr!, { margin: 1, width: 256 }).then(setQrImage),
    );
  }, [bot?.qr]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bot de WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {bot?.connected ? (
            <>
              <p className="rounded-lg bg-green-50 p-3 text-green-800">
                Conectado como <strong>+{bot.phone}</strong>. Los avisos se envían solos con el
                botón <Send className="inline h-3.5 w-3.5" /> de cada deudor
                {bot.aiEnabled ? " y el texto lo redacta la IA" : ""}.
              </p>
              {!bot.aiEnabled && (
                <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
                  Sin <code>GROQ_API_KEY</code> el texto sale de la plantilla fija.
                </p>
              )}
            </>
          ) : qrImage ? (
            <>
              <p className="text-gray-600">
                Escaneá este código desde el WhatsApp del club (Dispositivos vinculados):
              </p>
              <img src={qrImage} alt="QR de WhatsApp" className="mx-auto rounded border" />
              <p className="text-xs text-gray-400">
                El código se renueva solo cada ~30 segundos.
              </p>
            </>
          ) : (
            <p className="py-6 text-center text-gray-400">
              {connect.isPending ? "Pidiendo el QR…" : "Pulsa conectar para obtener el QR."}
            </p>
          )}
          {bot?.lastError && (
            <p className="rounded-lg bg-red-50 p-3 text-red-700">{bot.lastError}</p>
          )}
          <div className="flex justify-end gap-2">
            {bot?.connected ? (
              <Button
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Desvincular
              </Button>
            ) : (
              <Button
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Conectar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  const { data: bot } = trpc.alert.whatsappStatus.useQuery();
  const sendAlert = trpc.alert.sendAlert.useMutation({
    onSuccess: () => {
      utils.alert.getLogs.invalidate();
      utils.alert.getDebtors.invalidate();
      toast.success("Aviso enviado por WhatsApp");
      onDone();
    },
    onError: (err) => toast.error(err.message),
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
        <Button variant="outline" disabled={!prepared.phone} onClick={send}>
          <MessageCircle className="mr-1 h-4 w-4" /> Abrir WhatsApp
        </Button>
        <Button
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={!prepared.phone || !bot?.connected || sendAlert.isPending}
          title={bot?.connected ? "Lo manda el bot del club" : "Primero conectá el bot"}
          onClick={() =>
            sendAlert.mutate({ kind: target.kind, id: target.id, customMessage: message })
          }
        >
          <Send className="mr-1 h-4 w-4" />
          {sendAlert.isPending ? "Enviando…" : "Enviar automático"}
        </Button>
      </div>
    </div>
  );
}
