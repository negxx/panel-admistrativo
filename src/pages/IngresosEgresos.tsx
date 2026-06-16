import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowLeftRight,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import * as XLSX from "xlsx";

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

export default function IngresosEgresos() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    category: "",
    description: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
  });

  const utils = trpc.useUtils();
  const { data: transactionsData } = trpc.transaction.list.useQuery({
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, type: typeFilter || undefined, page: 1, pageSize: 100,
  });
  const { data: summary } = trpc.transaction.getSummary.useQuery({
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
  });
  const { data: monthlyTrend } = trpc.transaction.getMonthlyTrend.useQuery();

  const createTransaction = trpc.transaction.create.useMutation({
    onSuccess: () => {
      toast.success("Transaccion registrada");
      setDialogOpen(false);
      setForm({ type: "income", category: "", description: "", amount: 0, date: new Date().toISOString().split("T")[0] });
      utils.transaction.list.invalidate();
      utils.transaction.getSummary.invalidate();
      utils.transaction.getMonthlyTrend.invalidate();
      utils.dashboard.getSummary.invalidate();
    },
  });

  const deleteTransaction = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      toast.success("Transaccion eliminada");
      utils.transaction.list.invalidate();
      utils.transaction.getSummary.invalidate();
      utils.transaction.getMonthlyTrend.invalidate();
    },
  });

  const exportToExcel = () => {
    if (!transactionsData?.transactions.length) return;
    const rows = transactionsData.transactions.map((t) => ({
      Fecha: t.date,
      Tipo: t.type === "income" ? "Ingreso" : "Egreso",
      Categoria: t.category,
      Descripcion: t.description,
      Monto: t.amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
    XLSX.writeFile(wb, `transacciones_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Exportado a Excel");
  };

  const incomeCategories = ["Cuotas", "Venta", "Eventos", "Donaciones", "Otros"];
  const expenseCategories = ["Salarios", "Mantenimiento", "Servicios", "Equipamiento", "Transporte", "Otros"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a2e]">Ingresos y Egresos</h2>
          <p className="text-sm text-gray-500">Gestion financiera del club</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel}><Download className="w-4 h-4 mr-1" /> Exportar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]">
                <Plus className="w-4 h-4 mr-1" /> Nueva Transaccion
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nueva Transaccion</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <Button
                    variant={form.type === "income" ? "default" : "outline"}
                    className={`flex-1 ${form.type === "income" ? "bg-green-600" : ""}`}
                    onClick={() => setForm({ ...form, type: "income", category: "" })}
                  >
                    <TrendingUp className="w-4 h-4 mr-1" /> Ingreso
                  </Button>
                  <Button
                    variant={form.type === "expense" ? "default" : "outline"}
                    className={`flex-1 ${form.type === "expense" ? "bg-red-600" : ""}`}
                    onClick={() => setForm({ ...form, type: "expense", category: "" })}
                  >
                    <TrendingDown className="w-4 h-4 mr-1" /> Egreso
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(form.type === "income" ? incomeCategories : expenseCategories).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Descripcion</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Monto ($)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
                  <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => createTransaction.mutate(form)} disabled={createTransaction.isPending}>
                    Guardar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Total Ingresos</p><p className="text-xl font-bold font-mono text-green-600">{formatMoney(summary?.totalIncome ?? 0)}</p></div>
              <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="w-5 h-5 text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Total Egresos</p><p className="text-xl font-bold font-mono text-red-600">{formatMoney(summary?.totalExpense ?? 0)}</p></div>
              <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="w-5 h-5 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Balance Neto</p><p className={`text-xl font-bold font-mono ${(summary?.balance ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{formatMoney(summary?.balance ?? 0)}</p></div>
              <div className="p-2 bg-blue-50 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Tendencia Mensual (ultimos 6 meses)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5) ?? ""} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(value: number) => formatMoney(value)} />
                <Legend />
                <Bar dataKey="income" name="Ingresos" fill="#28a745" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Egresos" fill="#dc3545" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input type="date" className="w-full sm:w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" className="w-full sm:w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Ingreso</SelectItem>
            <SelectItem value="expense">Egreso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Fecha</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Tipo</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Categoria</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Descripcion</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-600">Monto</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-600"></th>
              </tr></thead>
              <tbody>
                {transactionsData?.transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-4">{t.date}</td>
                    <td className="py-3 px-4">
                      <Badge className={`text-xs ${t.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {t.type === "income" ? "Ingreso" : "Egreso"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">{t.category}</td>
                    <td className="py-3 px-4">{t.description}</td>
                    <td className={`py-3 px-4 text-right font-mono font-semibold ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
                      {t.type === "income" ? "+" : "-"}{formatMoney(t.amount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-red-500" onClick={() => { if (confirm("Eliminar esta transaccion?")) deleteTransaction.mutate({ id: t.id }); }}>
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {transactionsData?.transactions.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No hay transacciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
