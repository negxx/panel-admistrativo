import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Download,
  Hourglass,
  Percent,
  Receipt,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_FILTER, MONTH_NAMES } from "@contracts/constants";
import { CobrarDialog, type CobrarPayer } from "@/components/CobrarDialog";
import {
  EmptyRow,
  LoadingRows,
  MoneyStat,
  PageHeader,
  Pagination,
  QuotaStatusBadge,
} from "@/components/ui-kit";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Cuotas del mes.
 *
 * Arreglos respecto de la versión anterior:
 *
 *  - Las categorías salen de `category.list`. Antes se llamaba a
 *    `player.getCategories`, que no existe: el filtro quedaba siempre vacío.
 *  - Los filtros "Todas / Todos" ya no mandan el texto `"all"` como si fuera un
 *    valor real (eso hacía que la lista viniera vacía).
 *  - Los totales salen de `quota.summary`, calculado sobre todas las cuotas del
 *    período; antes se sumaba sólo la página que se estaba viendo.
 *  - El cobro pasa por el diálogo compartido, que valida contra el pagador.
 */
export default function Cuotas() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [status, setStatus] = useState<string>(ALL_FILTER);
  const [category, setCategory] = useState<string>(ALL_FILTER);
  const [page, setPage] = useState(1);
  const [payer, setPayer] = useState<CobrarPayer | null>(null);

  const utils = trpc.useUtils();

  // Un filtro en "all" significa "sin filtro": se manda `undefined`.
  const filters = {
    month,
    year,
    status: status === ALL_FILTER ? undefined : (status as "pending" | "paid" | "overdue"),
    category: category === ALL_FILTER ? undefined : category,
  };

  const { data, isLoading } = trpc.quota.list.useQuery({ ...filters, page, pageSize: 50 });
  const { data: summary } = trpc.quota.summary.useQuery({
    month,
    year,
    category: filters.category,
  });
  const { data: categories } = trpc.category.list.useQuery();
  const { data: years } = trpc.quota.availableYears.useQuery();

  const generate = trpc.quota.generateMonthly.useMutation({
    onSuccess: (result) => {
      const parts = [`${result.created} cuota(s) generada(s)`];
      if (result.skippedExisting > 0) parts.push(`${result.skippedExisting} ya existían`);
      if (result.skippedNoQuotaCategory > 0) {
        parts.push(`${result.skippedNoQuotaCategory} en categorías que no pagan cuota`);
      }
      toast.success(parts.join(" · "));

      if (result.missingCategories.length > 0) {
        toast.warning(
          `Sin generar: hay socios en categorías no cargadas (${result.missingCategories.join(", ")}). Cargalas en Categorías.`,
          { duration: 8000 },
        );
      }
      utils.quota.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const recalculate = trpc.quota.recalculateInterest.useMutation({
    onSuccess: (result) => {
      toast.success(
        `${result.markedOverdue} cuota(s) pasaron a vencidas · ${result.updated} con interés actualizado`,
      );
      utils.quota.invalidate();
    },
  });

  const quotas = data?.quotas ?? [];

  const exportToExcel = () => {
    if (quotas.length === 0) {
      toast.error("No hay cuotas para exportar");
      return;
    }
    const rows = quotas.map((q) => ({
      Socio: q.playerName,
      DNI: q.playerDni,
      Categoria: q.category,
      Tutor: q.guardianName ?? "",
      Periodo: `${q.month}/${q.year}`,
      "Monto base": q.baseAmount,
      Descuento: q.discountAmount,
      Interes: q.interestAmount,
      Total: q.totalAmount,
      Vencimiento: q.dueDate,
      Estado: q.status === "paid" ? "Pagada" : q.status === "pending" ? "Pendiente" : "Vencida",
      Recibo: q.receiptNumber ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Cuotas");
    XLSX.writeFile(book, `cuotas_${year}_${String(month).padStart(2, "0")}.xlsx`);
    toast.success("Exportado a Excel");
  };

  const collectionRate =
    summary && summary.expected > 0 ? (summary.collected / summary.expected) * 100 : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cuotas y pagos"
        subtitle="Generación mensual, cobros y estado de cada socio"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate.mutate({ month, year })}
              disabled={generate.isPending}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {generate.isPending ? "Generando…" : "Generar mes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculate.mutate()}
              disabled={recalculate.isPending}
            >
              <Percent className="mr-1 h-4 w-4" /> Recalcular mora
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="mr-1 h-4 w-4" /> Exportar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MoneyStat
          label="Total a cobrar"
          amount={summary?.expected ?? 0}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">Cobrado</p>
                <p className="font-mono text-xl font-bold text-green-600">
                  {formatMoney(summary?.collected ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-green-50 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, collectionRate)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">{collectionRate.toFixed(0)}% del período</p>
          </CardContent>
        </Card>
        <MoneyStat
          label="Pendiente / vencido"
          amount={summary?.pending ?? 0}
          tone="danger"
          icon={<AlertCircle className="h-5 w-5" />}
          hint={`${summary?.overdueCount ?? 0} cuota(s) vencida(s)`}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={String(month)}
          onValueChange={(v) => {
            setMonth(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(year)}
          onValueChange={(v) => {
            setYear(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(years ?? [now.getFullYear()]).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todas las categorías</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-600">
                  <th className="px-3 py-3 font-semibold">Socio</th>
                  <th className="px-3 py-3 font-semibold">Cat.</th>
                  <th className="px-3 py-3 text-right font-semibold">Base</th>
                  <th className="px-3 py-3 text-right font-semibold">Desc.</th>
                  <th className="px-3 py-3 text-right font-semibold">Interés</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Vence</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRows colSpan={9} />}
                {!isLoading && quotas.length === 0 && (
                  <EmptyRow
                    colSpan={9}
                    message="No hay cuotas para este período. Probá con 'Generar mes'."
                  />
                )}
                {quotas.map((quota) => (
                  <tr key={quota.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3">
                      <p className="font-medium">{quota.playerName}</p>
                      {quota.guardianName && (
                        <p className="text-xs text-gray-400">Tutor: {quota.guardianName}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500">{quota.category}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {formatMoney(quota.baseAmount)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-400">
                      {quota.discountAmount > 0 ? `−${formatMoney(quota.discountAmount)}` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {quota.interestAmount > 0 ? (
                        <span className="text-red-600">+{formatMoney(quota.interestAmount)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">
                      {formatMoney(quota.totalAmount)}
                    </td>
                    <td className="px-3 py-3 text-gray-500">{formatDate(quota.dueDate)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <QuotaStatusBadge status={quota.status} />
                        {quota.awaitingReview && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-200 text-xs text-amber-700"
                          >
                            <Hourglass className="h-3 w-3" /> En revisión
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {quota.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPayer(
                              quota.guardianId
                                ? {
                                    kind: "guardian",
                                    id: quota.guardianId,
                                    name: quota.guardianName ?? quota.playerName,
                                  }
                                : { kind: "player", id: quota.playerId, name: quota.playerName },
                            )
                          }
                        >
                          <Receipt className="mr-1 h-3.5 w-3.5" /> Cobrar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total ?? 0}
            onChange={setPage}
          />
        </CardContent>
      </Card>

      <CobrarDialog
        payer={payer}
        open={payer !== null}
        onOpenChange={(open) => !open && setPayer(null)}
      />
    </div>
  );
}
