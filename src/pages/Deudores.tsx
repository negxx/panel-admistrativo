import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  Send,
  MessageCircle,
  Users,
  DollarSign,
  Clock,
  Bell,
} from "lucide-react";
import { toast } from "sonner";

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

export default function Deudores() {
  const [selectedDebtors, setSelectedDebtors] = useState<number[]>([]);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [progress, setProgress] = useState(0);

  const utils = trpc.useUtils();
  const { data: debtors, isLoading } = trpc.alert.getDebtors.useQuery();
  const { data: alertLogs } = trpc.alert.getLogs.useQuery({});

  const sendBulk = trpc.alert.sendBulk.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.sent} alertas enviadas`);
      setBulkDialog(false);
      setSelectedDebtors([]);
      setProgress(0);
      utils.alert.getDebtors.invalidate();
      utils.alert.getLogs.invalidate();
    },
  });

  const toggleSelection = (id: number) => {
    setSelectedDebtors(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedDebtors.length === (debtors?.length ?? 0)) {
      setSelectedDebtors([]);
    } else {
      setSelectedDebtors(debtors?.map(d => d.guardianId) ?? []);
    }
  };

  const totalDebt = debtors?.reduce((s, d) => s + d.totalDebt, 0) ?? 0;
  const totalDebtors = debtors?.length ?? 0;
  const totalQuotas = debtors?.reduce((s, d) => s + d.quotaCount, 0) ?? 0;
  const todayAlerts = alertLogs?.filter(l => {
    const sent = l.sentAt ? new Date(l.sentAt) : null;
    const now = new Date();
    return sent && sent.toDateString() === now.toDateString();
  }).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a2e]">Deudores y Alertas</h2>
          <p className="text-sm text-gray-500">Gestion de morosidad y alertas WhatsApp</p>
        </div>
        {selectedDebtors.length > 0 && (
          <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => setBulkDialog(true)}>
            <Send className="w-4 h-4 mr-1" /> Enviar alertas ({selectedDebtors.length})
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Deudores</p><p className="text-xl font-bold">{totalDebtors}</p></div>
              <div className="p-2 bg-red-50 rounded-lg"><Users className="w-5 h-5 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Monto Adeudado</p><p className="text-xl font-bold font-mono text-red-600">{formatMoney(totalDebt)}</p></div>
              <div className="p-2 bg-red-50 rounded-lg"><DollarSign className="w-5 h-5 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Cuotas Vencidas</p><p className="text-xl font-bold">{totalQuotas}</p></div>
              <div className="p-2 bg-orange-50 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-500">Alertas Hoy</p><p className="text-xl font-bold">{todayAlerts}</p></div>
              <div className="p-2 bg-blue-50 rounded-lg"><Bell className="w-5 h-5 text-blue-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Debtors Table */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <Checkbox checked={debtors && selectedDebtors.length === debtors.length && debtors.length > 0} onCheckedChange={selectAll} />
            <CardTitle className="text-base font-semibold">Listado de Deudores</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="py-3 px-3 w-8"></th>
                <th className="text-left py-3 px-3 font-semibold text-gray-600">Tutor</th>
                <th className="text-left py-3 px-3 font-semibold text-gray-600">Cuotas</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-600">Total</th>
                <th className="text-left py-3 px-3 font-semibold text-gray-600">Ult. Alerta</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-600">Acciones</th>
              </tr></thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50"><td colSpan={6} className="py-3 px-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                ))}
                {debtors?.map((d) => (
                  <tr key={d.guardianId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3">
                      <Checkbox checked={selectedDebtors.includes(d.guardianId)} onCheckedChange={() => toggleSelection(d.guardianId)} />
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium">{d.guardianName}</div>
                      <div className="text-xs text-gray-400">{d.guardianPhone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">{d.quotaCount} vencidas</Badge>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-red-600">{formatMoney(d.totalDebt)}</td>
                    <td className="py-3 px-3 text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {d.lastAlertDate
                          ? new Date(d.lastAlertDate).toLocaleDateString("es-AR")
                          : <span className="text-orange-500">Nunca</span>
                        }
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a href={`https://wa.me/${d.guardianPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50">
                            <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                          </Button>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && debtors?.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-green-600">
                    <div className="flex flex-col items-center gap-2">
                      <CheckIcon />
                      <p>No hay deudores activos</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Alert Logs */}
      {alertLogs && alertLogs.length > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Historial de Alertas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Tutor</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Mensaje</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Estado</th>
                </tr></thead>
                <tbody>
                  {alertLogs.slice(0, 10).map((log) => (
                    <tr key={log.id} className="border-b border-gray-50">
                      <td className="py-3 px-4 text-gray-500">{log.sentAt ? new Date(log.sentAt).toLocaleString("es-AR") : "-"}</td>
                      <td className="py-3 px-4 font-medium">{log.guardianName ?? "N/A"}</td>
                      <td className="py-3 px-4 text-sm max-w-xs truncate">{log.message}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={`text-xs ${log.status === "sent" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {log.status === "sent" ? "Enviado" : "Fallido"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enviar Alertas Masivas</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">Se enviaran alertas de WhatsApp a <strong>{selectedDebtors.length}</strong> tutores seleccionados.</p>
            <div className="bg-gray-50 p-3 rounded max-h-32 overflow-y-auto text-xs space-y-1">
              {debtors?.filter(d => selectedDebtors.includes(d.guardianId)).map(d => (
                <div key={d.guardianId}>{d.guardianName} - {formatMoney(d.totalDebt)}</div>
              ))}
            </div>
            {progress > 0 && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#ffc107] rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkDialog(false)}>Cancelar</Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setProgress(50);
                  sendBulk.mutate({ guardianIds: selectedDebtors });
                }}
                disabled={sendBulk.isPending}
              >
                <Send className="w-4 h-4 mr-1" /> Enviar Alertas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
