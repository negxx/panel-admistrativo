import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Receipt } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { QuotaStatusBadge } from "@/components/ui-kit";

/**
 * Diálogo de cobro del mostrador.
 *
 * Se usa desde Cuotas, Familias, Deudores y Cierre de Caja: antes cada pantalla
 * tenía su propia copia del formulario, con validaciones distintas.
 *
 * El importe lo calcula el servidor a partir de las cuotas elegidas; acá sólo se
 * muestra un total para que el operador lo confirme con la familia.
 */

export type CobrarPayer = {
  kind: "guardian" | "player";
  id: number;
  name: string;
};

export function CobrarDialog({
  payer,
  open,
  onOpenChange,
  onPaid,
}: {
  payer: CobrarPayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar cuotas{payer ? ` — ${payer.name}` : ""}</DialogTitle>
        </DialogHeader>
        {/* La `key` remonta el formulario cuando cambia la persona: así el
            estado (selección, medio de pago, notas) se reinicia solo, sin
            necesidad de un efecto que lo limpie. */}
        {open && payer && (
          <CobrarForm
            key={`${payer.kind}-${payer.id}`}
            payer={payer}
            onClose={() => onOpenChange(false)}
            onPaid={onPaid}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CobrarForm({
  payer,
  onClose,
  onPaid,
}: {
  payer: CobrarPayer;
  onClose: () => void;
  onPaid?: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [method, setMethod] = useState<"cash" | "transfer" | "mercadopago">("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.payment.pendingQuotasFor.useQuery({
    payer: { kind: payer.kind, id: payer.id },
  });

  const register = trpc.payment.register.useMutation({
    onSuccess: (result) => {
      toast.success(`Pago registrado. Recibo ${result.payment.receiptNumber}`);
      onClose();
      utils.invalidate();
      onPaid?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const quotas = useMemo(() => data?.quotas ?? [], [data]);
  const total = useMemo(
    () => quotas.filter((q) => selected.includes(q.id)).reduce((sum, q) => sum + q.totalAmount, 0),
    [quotas, selected],
  );

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAll = () =>
    setSelected(selected.length === quotas.length ? [] : quotas.map((q) => q.id));

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-gray-500">Buscando cuotas…</p>;
  }

  if (quotas.length === 0) {
    return (
      <div className="space-y-4 pt-2">
        <p className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          Esta cuenta no tiene cuotas pendientes. Está al día.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Elegí las cuotas a cobrar</p>
        <button type="button" onClick={selectAll} className="text-sm text-[#1a237e] hover:underline">
          {selected.length === quotas.length ? "Deseleccionar todo" : "Seleccionar todo"}
        </button>
      </div>

      <div className="space-y-1.5">
        {quotas.map((quota) => (
          <label
            key={quota.id}
            className="flex cursor-pointer items-center gap-3 rounded bg-gray-50 px-3 py-2 text-sm"
          >
            <Checkbox checked={selected.includes(quota.id)} onCheckedChange={() => toggle(quota.id)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{quota.playerName}</p>
              <p className="text-xs text-gray-500">
                {formatPeriod(quota.month, quota.year)} · vence {formatDate(quota.dueDate)}
                {quota.interestAmount > 0 && <> · interés {formatMoney(quota.interestAmount)}</>}
              </p>
              {quota.awaitingReview && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  El socio ya informó un pago de esta cuota desde el portal
                </p>
              )}
            </div>
            <QuotaStatusBadge status={quota.status} />
            <span className="w-24 text-right font-mono font-semibold">
              {formatMoney(quota.totalAmount)}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
        <span className="font-semibold">Total a cobrar</span>
        <span className="font-mono text-xl font-bold">{formatMoney(total)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Medio de pago</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="mercadopago">MercadoPago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Comprobante / operación</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observaciones</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcional"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
          disabled={selected.length === 0 || register.isPending}
          onClick={() =>
            register.mutate({
              payer: { kind: payer.kind, id: payer.id },
              quotaIds: selected,
              paymentMethod: method,
              reference: reference || undefined,
              notes: notes || undefined,
            })
          }
        >
          <Receipt className="mr-1 h-4 w-4" />
          {register.isPending ? "Registrando…" : "Registrar cobro"}
        </Button>
      </div>
    </div>
  );
}
