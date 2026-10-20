import { useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  CreditCard,
  Lock,
  Search,
  TrendingDown,
  Unlock,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CobrarDialog, type CobrarPayer } from "@/components/CobrarDialog";
import { EmptyRow, MoneyStat, PageHeader } from "@/components/ui-kit";
import { formatDate, formatMoney, todayInput } from "@/lib/format";

/**
 * Cierre de caja diario.
 *
 * Cambios respecto de la versión anterior:
 *
 *  - Los totales los calcula el servidor desde los pagos y movimientos reales
 *    del día. Antes se acumulaban de a poco y cualquier edición los descuadraba.
 *  - Quién abre y quién cierra sale de la sesión. Antes el frontend mandaba un
 *    `1` fijo.
 *  - El efectivo esperado descuenta los egresos pagados en efectivo.
 */
export default function CierreCaja() {
  const today = todayInput();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [searchDni, setSearchDni] = useState("");
  const [payer, setPayer] = useState<CobrarPayer | null>(null);

  const utils = trpc.useUtils();
  const { data: todayData, isLoading } = trpc.closure.getByDate.useQuery({ date: today });
  const { data: history } = trpc.closure.list.useQuery({ limit: 30 });

  const { data: found, isFetching: searching } = trpc.guardian.searchByDni.useQuery(
    { dni: searchDni },
    { enabled: searchDni.length >= 7 },
  );

  const openCash = trpc.closure.open.useMutation({
    onSuccess: () => {
      toast.success("Caja abierta");
      setOpenDialog(false);
      setOpeningAmount("");
      utils.closure.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const closeCash = trpc.closure.close.useMutation({
    onSuccess: (result) => {
      const label =
        result.difference === 0
          ? "sin diferencias"
          : result.difference > 0
            ? `sobrante de ${formatMoney(result.difference)}`
            : `faltante de ${formatMoney(Math.abs(result.difference))}`;
      toast.success(`Caja cerrada, ${label}`);
      setCloseDialog(false);
      setActualCash("");
      setNotes("");
      utils.closure.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const closure = todayData?.closure ?? null;
  const totals = todayData?.totals;
  const expectedCash = todayData?.expectedCash ?? 0;

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4 animate-fade-in lg:space-y-6">
      <PageHeader
        title="Cierre de caja"
        subtitle={`Movimientos del ${formatDate(today)}`}
        actions={
          !closure ? (
            <Button onClick={() => setOpenDialog(true)}>
              <Unlock className="mr-1 h-4 w-4" /> Abrir caja
            </Button>
          ) : closure.status === "open" ? (
            <Button onClick={() => setCloseDialog(true)}>
              <Lock className="mr-1 h-4 w-4" /> Cerrar caja
            </Button>
          ) : (
            <Badge variant="outline" className="border-border px-3 py-1.5 text-muted-foreground">
              Caja cerrada
            </Badge>
          )
        }
      />

      {!closure && (
        <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm text-info">
          Todavía no abriste la caja de hoy. Los cobros igual se registran; abrirla sirve para hacer
          el arqueo del efectivo al final del día.
        </div>
      )}

      {/* Movimientos del día */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MoneyStat
          label="Efectivo"
          amount={totals?.cashSales ?? 0}
          tone="positive"
          icon={<Banknote className="h-5 w-5" />}
        />
        <MoneyStat
          label="Transferencias"
          amount={totals?.transferSales ?? 0}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <MoneyStat
          label="MercadoPago"
          amount={totals?.mpSales ?? 0}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <MoneyStat
          label="Egresos"
          amount={totals?.totalExpenses ?? 0}
          tone="danger"
          icon={<TrendingDown className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-xl border-border/70 py-0 shadow-card lg:col-span-1">
          <CardHeader className="pt-4 pb-3">
            <CardTitle className="text-base">Arqueo de efectivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Apertura" value={formatMoney(closure?.openingAmount ?? 0)} />
            <Row label="Cobros en efectivo" value={formatMoney(totals?.cashSales ?? 0)} />
            <Row label="Otros ingresos en efectivo" value={formatMoney(totals?.otherCashIncome ?? 0)} />
            <Row
              label="Egresos en efectivo"
              value={`−${formatMoney(totals?.cashExpenses ?? 0)}`}
              tone="danger"
            />
            <div className="mt-2 flex justify-between border-t border-border/60 pt-2 font-semibold">
              <span>Debería haber</span>
              <span className="tabular">{formatMoney(expectedCash)}</span>
            </div>
            {closure?.status === "closed" && (
              <>
                <Row label="Contado al cerrar" value={formatMoney(closure.actualCash)} />
                <div
                  className={`flex justify-between rounded-lg p-2 font-semibold ${
                    closure.difference === 0
                      ? "bg-success/10 text-success"
                      : closure.difference > 0
                        ? "bg-info/10 text-info"
                        : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <span>
                    {closure.difference === 0
                      ? "Sin diferencia"
                      : closure.difference > 0
                        ? "Sobrante"
                        : "Faltante"}
                  </span>
                  <span className="tabular">{formatMoney(Math.abs(closure.difference))}</span>
                </div>
                {closure.notes && (
                  <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                    {closure.notes}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Cobro rápido en el mostrador */}
        <Card className="rounded-xl border-border/70 py-0 shadow-card lg:col-span-2">
          <CardHeader className="pt-4 pb-3">
            <CardTitle className="text-base">Cobrar en el mostrador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                inputMode="numeric"
                placeholder="Buscar por DNI del socio o del tutor…"
                value={searchDni}
                onChange={(e) => setSearchDni(e.target.value.replace(/\D/g, ""))}
              />
            </div>

            {searchDni.length >= 7 && searching && (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            )}

            {searchDni.length >= 7 && !searching && !found && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                No encontramos a nadie con ese DNI.
              </p>
            )}

            {found && (
              <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
                <div>
                  <p className="font-medium">{found.name}</p>
                  <p className="text-xs text-muted-foreground">
                    DNI {found.dni}
                    {found.matchedBy === "player" && found.kind === "guardian" && (
                      <> · se cobra a través del tutor</>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPayer({ kind: found.kind, id: found.id, name: found.name })}
                >
                  Ver cuotas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial */}
      <Card className="rounded-xl border-border/70 py-0 shadow-card overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle className="text-base">Cierres anteriores</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Abrió</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Egresos</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).length === 0 && (
                <EmptyRow colSpan={6} message="Todavía no hay cierres registrados." />
              )}
              {(history ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">{formatDate(row.date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.openedByName ?? "—"}</td>
                  <td className="tabular px-4 py-3 text-right font-semibold text-success">
                    {formatMoney(row.totalIncome)}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-semibold text-destructive">
                    {formatMoney(row.totalExpenses)}
                  </td>
                  <td className="tabular px-4 py-3 text-right">
                    {row.status === "closed" ? (
                      <span
                        className={
                          row.difference === 0
                            ? "text-muted-foreground"
                            : row.difference > 0
                              ? "text-info"
                              : "text-destructive"
                        }
                      >
                        {row.difference > 0 ? "+" : ""}
                        {formatMoney(row.difference)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        row.status === "open"
                          ? "border-success/25 bg-success/10 text-success"
                          : "border-border text-muted-foreground"
                      }
                    >
                      {row.status === "open" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Abrir caja */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir caja — {formatDate(today)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Efectivo inicial en el cajón</Label>
              <Input
                type="number"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button
                disabled={openCash.isPending}
                onClick={() =>
                  openCash.mutate({ date: today, openingAmount: Number(openingAmount) || 0 })
                }
              >
                Abrir caja
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cerrar caja */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cerrar caja — {formatDate(today)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Debería haber en efectivo</span>
                <span className="tabular font-semibold">{formatMoney(expectedCash)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Efectivo contado</Label>
              <Input
                type="number"
                min="0"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0"
                autoFocus
              />
              {actualCash !== "" && (
                <p className="text-xs text-muted-foreground">
                  Diferencia: {formatMoney(Number(actualCash) - expectedCash)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Observaciones</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloseDialog(false)}>
                Cancelar
              </Button>
              <Button
                disabled={actualCash === "" || closeCash.isPending || !closure}
                onClick={() =>
                  closure &&
                  closeCash.mutate({
                    id: closure.id,
                    actualCash: Number(actualCash) || 0,
                    notes: notes || undefined,
                  })
                }
              >
                Cerrar caja
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CobrarDialog
        payer={payer}
        open={payer !== null}
        onOpenChange={(open) => !open && setPayer(null)}
        onPaid={() => setSearchDni("")}
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular ${tone === "danger" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}
