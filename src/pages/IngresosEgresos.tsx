import { useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_FILTER } from "@contracts/constants";
import { EmptyRow, LoadingRows, MethodLabel, MoneyStat, PageHeader, Pagination } from "@/components/ui-kit";
import { formatDate, formatMoney, todayInput } from "@/lib/format";

/**
 * Ingresos y egresos que no son cuotas.
 *
 * Novedades:
 *  - Cada movimiento registra **con qué medio** se pagó. Es lo que permite que
 *    el arqueo de caja descuente sólo los gastos en efectivo.
 *  - El filtro "Todos" ya no manda el texto `"all"` como si fuera un tipo real.
 *  - Se puede editar y borrar; cada cambio recalcula el cierre del día afectado.
 */

const emptyForm = {
  type: "expense" as "income" | "expense",
  category: "",
  description: "",
  amount: "",
  date: todayInput(),
  method: "cash" as "cash" | "transfer" | "mercadopago",
};

export default function IngresosEgresos() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const utils = trpc.useUtils();

  const filters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    type: typeFilter === ALL_FILTER ? undefined : (typeFilter as "income" | "expense"),
  };

  const { data, isLoading } = trpc.transaction.list.useQuery({ ...filters, page, pageSize: 50 });
  const { data: summary } = trpc.transaction.getSummary.useQuery({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  const { data: trend } = trpc.transaction.getMonthlyTrend.useQuery();
  const { data: knownCategories } = trpc.transaction.categories.useQuery();

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const create = trpc.transaction.create.useMutation({
    onSuccess: () => {
      toast.success("Movimiento registrado");
      closeDialog();
      utils.transaction.invalidate();
      utils.closure.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.transaction.update.useMutation({
    onSuccess: () => {
      toast.success("Movimiento actualizado");
      closeDialog();
      utils.transaction.invalidate();
      utils.closure.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      toast.success("Movimiento eliminado");
      utils.transaction.invalidate();
      utils.closure.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("El importe tiene que ser mayor a cero");
      return;
    }
    const payload = {
      type: form.type,
      category: form.category.trim(),
      description: form.description.trim(),
      amount: Math.round(amount),
      date: form.date,
      method: form.method,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  };

  const transactions = data?.transactions ?? [];

  const exportToExcel = () => {
    if (transactions.length === 0) {
      toast.error("No hay movimientos para exportar");
      return;
    }
    const rows = transactions.map((t) => ({
      Fecha: t.date,
      Tipo: t.type === "income" ? "Ingreso" : "Egreso",
      Categoria: t.category,
      Descripcion: t.description,
      Medio: t.method,
      Importe: t.amount,
      Cargado_por: t.createdByName ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Movimientos");
    XLSX.writeFile(book, "movimientos.xlsx");
    toast.success("Exportado a Excel");
  };

  const chartData = (trend ?? []).map((t) => ({
    mes: t.month,
    Ingresos: Number(t.income),
    Egresos: Number(t.expense),
  }));

  return (
    <div className="space-y-4 animate-fade-in lg:space-y-6">
      <PageHeader
        title="Ingresos y egresos"
        subtitle="Movimientos del club que no son cuotas"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="mr-1 h-4 w-4" /> Exportar
            </Button>
            <Button
              onClick={() => {
                setForm(emptyForm);
                setEditingId(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Nuevo movimiento
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MoneyStat
          label="Ingresos"
          amount={summary?.totalIncome ?? 0}
          tone="positive"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MoneyStat
          label="Egresos"
          amount={summary?.totalExpense ?? 0}
          tone="danger"
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <MoneyStat
          label="Balance"
          amount={summary?.balance ?? 0}
          tone={(summary?.balance ?? 0) >= 0 ? "positive" : "danger"}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      {chartData.length > 0 && (
        <Card className="rounded-xl border-border/70 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="mes"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  formatter={(value: number) => formatMoney(value)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    color: "hsl(var(--foreground))",
                  }}
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                />
                <Bar dataKey="Ingresos" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Egresos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="date"
          className="w-full sm:w-44"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          className="w-full sm:w-44"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>Todos</SelectItem>
            <SelectItem value="income">Ingresos</SelectItem>
            <SelectItem value="expense">Egresos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-xl border-border/70 py-0 shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Medio</th>
                  <th className="px-4 py-3 text-right">Importe</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRows colSpan={6} />}
                {!isLoading && transactions.length === 0 && (
                  <EmptyRow colSpan={6} message="No hay movimientos en este período." />
                )}
                {transactions.map((movement) => (
                  <tr
                    key={movement.id}
                    className="border-b border-border/60 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(movement.date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{movement.description}</p>
                      {movement.createdByName && (
                        <p className="text-xs text-muted-foreground">Cargó {movement.createdByName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {movement.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <MethodLabel method={movement.method} />
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      <span
                        className={movement.type === "income" ? "text-success" : "text-destructive"}
                      >
                        {movement.type === "income" ? "+" : "−"}
                        {formatMoney(movement.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(movement.id);
                            setForm({
                              type: movement.type,
                              category: movement.category,
                              description: movement.description,
                              amount: String(movement.amount),
                              date: movement.date,
                              method: movement.method,
                            });
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove.mutate({ id: movement.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.type === "income" ? "default" : "outline"}
                className={
                  form.type === "income" ? "bg-success text-success-foreground hover:bg-success/90" : ""
                }
                onClick={() => setForm({ ...form, type: "income" })}
              >
                <TrendingUp className="mr-1 h-4 w-4" /> Ingreso
              </Button>
              <Button
                type="button"
                variant={form.type === "expense" ? "default" : "outline"}
                className={
                  form.type === "expense"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : ""
                }
                onClick={() => setForm({ ...form, type: "expense" })}
              >
                <TrendingDown className="mr-1 h-4 w-4" /> Egreso
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: compra de pelotas"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Input
                list="categorias-movimientos"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej: Equipamiento"
              />
              <datalist id="categorias-movimientos">
                {(knownCategories ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Importe</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Medio de pago</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setForm({ ...form, method: v as typeof form.method })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sólo los movimientos en efectivo afectan el arqueo de caja.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                disabled={
                  !form.description || !form.category || !form.amount || create.isPending || update.isPending
                }
              >
                {editingId ? "Guardar" : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
