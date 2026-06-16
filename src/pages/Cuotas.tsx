import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign,
  RefreshCw,
  CheckCircle2,
  Settings2,
  Download,
  Receipt,
  Percent,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

export default function Cuotas() {
  const [tab, setTab] = useState("cuotas");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedQuotas, setSelectedQuotas] = useState<number[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "mercadopago">("cash");
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ interestRate: 0.5, graceDays: 3, dueDay: 10, discountEnabled: true, discountPercent: 10 });

  const utils = trpc.useUtils();
  const { data: quotasData, isLoading } = trpc.quota.list.useQuery({
    month, year, category: categoryFilter || undefined, status: statusFilter || undefined, page: 1, pageSize: 100,
  });
  const { data: categories } = trpc.player.getCategories.useQuery();
  const { data: settings } = trpc.quota.getGlobalSettings.useQuery();
  const { data: configs } = trpc.quota.getConfigs.useQuery();

  const registerPayment = trpc.payment.register.useMutation({
    onSuccess: () => {
      toast.success("Pago registrado correctamente");
      setPaymentDialog(false);
      setSelectedQuotas([]);
      utils.quota.list.invalidate();
      utils.dashboard.getSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const recalculateInterest = trpc.quota.recalculateInterest.useMutation({
    onSuccess: (data) => { toast.success(`${data.updated} cuotas actualizadas`); utils.quota.list.invalidate(); },
  });

  const generateMonthly = trpc.quota.generateMonthly.useMutation({
    onSuccess: (data) => { toast.success(`${data.created} cuotas generadas`); utils.quota.list.invalidate(); },
  });

  const updateSettings = trpc.quota.updateGlobalSettings.useMutation({
    onSuccess: () => { toast.success("Configuracion actualizada"); setSettingsDialog(false); utils.quota.getGlobalSettings.invalidate(); },
  });

  const totalExpected = quotasData?.quotas.reduce((s, q) => s + q.baseAmount, 0) ?? 0;
  const totalCollected = quotasData?.quotas.filter(q => q.status === "paid").reduce((s, q) => s + q.totalAmount, 0) ?? 0;
  const totalPending = quotasData?.quotas.filter(q => q.status !== "paid").reduce((s, q) => s + q.displayTotal, 0) ?? 0;
  const exportToExcel = () => {
    if (!quotasData?.quotas.length) return;
    const rows = quotasData.quotas.map((q) => ({
      Jugador: q.playerName ?? "N/A",
      Categoria: q.category ?? "",
      Periodo: `${q.month}/${q.year}`,
      "Monto Base": q.baseAmount,
      Descuento: q.discountAmount ?? 0,
      Intereses: q.calculatedInterest ?? q.interestAmount ?? 0,
      Total: q.displayTotal,
      Vencimiento: q.dueDate,
      Estado: q.status === "paid" ? "Pagada" : q.status === "pending" ? "Pendiente" : "Vencida",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cuotas");
    XLSX.writeFile(wb, `cuotas_${month}_${year}.xlsx`);
    toast.success("Exportado a Excel");
  };

  const statusColors: Record<string, string> = {
    paid: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-orange-100 text-orange-700 border-orange-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Total a Cobrar</p><p className="text-xl font-bold font-mono">{formatMoney(totalExpected)}</p></div>
              <div className="p-2 bg-blue-50 rounded-lg"><DollarSign className="w-5 h-5 text-blue-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Cobrado</p><p className="text-xl font-bold font-mono text-green-600">{formatMoney(totalCollected)}</p></div>
              <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            </div>
            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Pendiente/Vencido</p><p className="text-xl font-bold font-mono text-red-600">{formatMoney(totalPending)}</p></div>
              <div className="p-2 bg-red-50 rounded-lg"><AlertCircle className="w-5 h-5 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="cuotas">Cuotas del Mes</TabsTrigger>
            <TabsTrigger value="config">Configuracion</TabsTrigger>
          </TabsList>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => generateMonthly.mutate({ month, year })}>
              <RefreshCw className="w-4 h-4 mr-1" /> Generar Mes
            </Button>
            <Button variant="outline" size="sm" onClick={() => recalculateInterest.mutate()}>
              <Percent className="w-4 h-4 mr-1" /> Recalcular Intereses
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="w-4 h-4 mr-1" /> Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={() => { if (settings) setSettingsForm(settings); setSettingsDialog(true); }}>
              <Settings2 className="w-4 h-4 mr-1" /> Config
            </Button>
          </div>
        </div>

        <TabsContent value="cuotas" className="m-0">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories?.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="paid">Pagada</SelectItem>
                <SelectItem value="overdue">Vencida</SelectItem>
              </SelectContent>
            </Select>
            {selectedQuotas.length > 0 && (
              <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => setPaymentDialog(true)}>
                <Receipt className="w-4 h-4 mr-1" /> Pagar Seleccion ({selectedQuotas.length})
              </Button>
            )}
          </div>

          {/* Table */}
          <Card className="border border-gray-200">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="py-3 px-3 w-8"></th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600">Socio</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600">Cat.</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600">Base</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600">Interes</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600">Total</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600">Vence</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600">Estado</th>
                  </tr></thead>
                  <tbody>
                    {isLoading && Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50"><td colSpan={8} className="py-3 px-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                    ))}
                    {quotasData?.quotas.map((q) => (
                      <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 px-3">
                          {q.status !== "paid" && (
                            <Checkbox
                              checked={selectedQuotas.includes(q.id)}
                              onCheckedChange={(checked) => {
                                setSelectedQuotas(prev => checked ? [...prev, q.id] : prev.filter(id => id !== q.id));
                              }}
                            />
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium">{q.playerName ?? "N/A"}<br/><span className="text-xs text-gray-400 font-mono">{q.playerDni}</span></td>
                        <td className="py-3 px-3"><Badge variant="outline" className="text-xs">{q.category}</Badge></td>
                        <td className="py-3 px-3 text-right font-mono">{formatMoney(q.baseAmount)}</td>
                        <td className="py-3 px-3 text-right font-mono text-red-500">{q.calculatedInterest ? `+${formatMoney(q.calculatedInterest)}` : q.interestAmount ? `+${formatMoney(q.interestAmount)}` : "-"}</td>
                        <td className="py-3 px-3 text-right font-mono font-semibold">{formatMoney(q.displayTotal)}</td>
                        <td className="py-3 px-3 text-gray-500">{q.dueDate}</td>
                        <td className="py-3 px-3"><Badge variant="outline" className={`text-xs capitalize ${statusColors[q.status] ?? ""}`}>{q.status === "paid" ? "Pagada" : q.status === "pending" ? "Pendiente" : "Vencida"}</Badge></td>
                      </tr>
                    ))}
                    {!isLoading && quotasData?.quotas.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-gray-400">No hay cuotas para este periodo</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="m-0">
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-base">Montos por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {configs?.map((c) => (
                  <div key={c.category} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">Cat. {c.category}</Badge>
                      <span className="font-mono font-semibold">{formatMoney(c.baseAmount)}</span>
                    </div>
                    <span className="text-xs text-gray-500">Desc. hermanos: {c.siblingDiscountPercent}%</span>
                  </div>
                ))}
                <p className="text-sm text-gray-500 mt-2">
                  Tasa de interes diaria: <strong>{settings?.interestRate ?? 0.5}%</strong> | Dias de gracia: <strong>{settings?.graceDays ?? 3}</strong> | Vencimiento: dia <strong>{settings?.dueDay ?? 10}</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Pago</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-500">Cuotas seleccionadas: <strong>{selectedQuotas.length}</strong></p>
              <p className="text-lg font-bold font-mono mt-1">
                Total: {formatMoney(quotasData?.quotas.filter(q => selectedQuotas.includes(q.id)).reduce((s, q) => s + q.displayTotal, 0) ?? 0)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Metodo de pago</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "transfer" | "mercadopago")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancelar</Button>
              <Button className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
                onClick={() => {
                  const firstQuota = quotasData?.quotas.find(q => selectedQuotas.includes(q.id));
                  if (firstQuota?.guardianId) {
                    registerPayment.mutate({ guardianId: firstQuota.guardianId, quotaIds: selectedQuotas, paymentMethod });
                  } else {
                    toast.error("No se pudo determinar el tutor");
                  }
                }}
                disabled={registerPayment.isPending}
              >
                Confirmar Pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Configuracion de Cuotas</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Interes diario (%)</Label><Input type="number" step="0.1" value={settingsForm.interestRate} onChange={(e) => setSettingsForm({ ...settingsForm, interestRate: parseFloat(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Dias de gracia</Label><Input type="number" value={settingsForm.graceDays} onChange={(e) => setSettingsForm({ ...settingsForm, graceDays: parseInt(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Dia de vencimiento</Label><Input type="number" value={settingsForm.dueDay} onChange={(e) => setSettingsForm({ ...settingsForm, dueDay: parseInt(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>% Descuento</Label><Input type="number" value={settingsForm.discountPercent} onChange={(e) => setSettingsForm({ ...settingsForm, discountPercent: parseFloat(e.target.value) })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSettingsDialog(false)}>Cancelar</Button>
              <Button className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => updateSettings.mutate(settingsForm)}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
