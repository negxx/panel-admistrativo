import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Lock, Unlock, Trash2, Search, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function CierreCaja() {
  const [open, setOpen] = useState(false);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [searchDni, setSearchDni] = useState("");
  const [selectedGuardian, setSelectedGuardian] = useState<any>(null);
  const [selectedQuotas, setSelectedQuotas] = useState<number[]>([]);
  const [form, setForm] = useState({
    openingAmount: "",
    actualCash: "",
    notes: "",
  });

  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: closures, isLoading } = trpc.closure.list.useQuery();
  const { data: todayClosure } = trpc.closure.getByDate.useQuery({ date: today });

  const { data: guardianSearch } = trpc.portal.getGuardianByDni.useQuery(
    { dni: searchDni },
    { enabled: searchDni.length >= 7 }
  );

  const { data: pendingQuotas } = trpc.portal.getPendingQuotas.useQuery(
    { guardianId: selectedGuardian?.id },
    { enabled: !!selectedGuardian }
  );

  const openMutation = trpc.closure.open.useMutation({
    onSuccess: () => {
      utils.closure.list.invalidate();
      utils.closure.getByDate.invalidate({ date: today });
      setOpen(false);
      setForm({ openingAmount: "", actualCash: "", notes: "" });
    },
  });

  const closeMutation = trpc.closure.close.useMutation({
    onSuccess: () => {
      utils.closure.list.invalidate();
      utils.closure.getByDate.invalidate({ date: today });
      setForm({ openingAmount: "", actualCash: "", notes: "" });
    },
  });

  const deleteMutation = trpc.closure.delete.useMutation({
    onSuccess: () => utils.closure.list.invalidate(),
  });

  const registerPayment = trpc.payment.register.useMutation({
    onSuccess: () => {
      toast.success("Pago registrado correctamente!");
      utils.closure.getByDate.invalidate({ date: today });
      utils.portal.getPendingQuotas.invalidate();
      setRegisterDialog(false);
      setSearchDni("");
      setSelectedGuardian(null);
      setSelectedQuotas([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault();
    openMutation.mutate({
      date: today,
      openingAmount: Number(form.openingAmount) || 0,
      openedBy: 1,
    });
  };

  const handleClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todayClosure) return;

    closeMutation.mutate({
      id: todayClosure.id,
      closedBy: 1,
      actualCash: Number(form.actualCash) || 0,
      notes: form.notes,
    });
  };

  if (isLoading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cierre de Caja</h2>
          <p className="text-gray-500">Gestion diaria de ingresos y arqueo</p>
        </div>
        {!todayClosure && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Abrir Caja
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir Caja - {today}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleOpen} className="space-y-4">
                <div>
                  <Label>Monto inicial en efectivo ($)</Label>
                  <Input
                    type="number"
                    value={form.openingAmount}
                    onChange={(e) => setForm({ ...form, openingAmount: e.target.value })}
                    placeholder="0"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Abrir Caja
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Estado actual */}
      {todayClosure && (
        <Card className={todayClosure.status === "open" ? "border-yellow-400" : "border-green-400"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {todayClosure.status === "open" ? (
                <Unlock className="w-5 h-5 text-yellow-500" />
              ) : (
                <Lock className="w-5 h-5 text-green-500" />
              )}
              Caja del {todayClosure.date} - {todayClosure.status === "open" ? "ABIERTA" : "CERRADA"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Apertura</p>
                <p className="text-lg font-bold">${(todayClosure.openingAmount || 0).toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Ventas Efectivo</p>
                <p className="text-lg font-bold">${(todayClosure.cashSales || 0).toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Efectivo Esperado</p>
                <p className="text-lg font-bold">${((todayClosure.openingAmount || 0) + (todayClosure.cashSales || 0)).toLocaleString()}</p>
              </div>
            </div>

            {todayClosure.status === "open" && (
              <>
                {/* Registrar pago en efectivo */}
                <div className="border-t pt-4">
                  <h3 className="font-bold mb-2">Registrar pago en efectivo</h3>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setRegisterDialog(true)}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Registrar pago de socio
                  </Button>
                </div>

                <form onSubmit={handleClose} className="space-y-4 border-t pt-4">
                  <h3 className="font-bold">Cerrar Caja</h3>
                  <div>
                    <Label>Efectivo contado en caja ($)</Label>
                    <Input
                      type="number"
                      value={form.actualCash}
                      onChange={(e) => setForm({ ...form, actualCash: e.target.value })}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div>
                    <Label>Observaciones</Label>
                    <Input
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Opcional"
                    />
                  </div>
                  <Button type="submit" className="w-full" variant="default">
                    <Lock className="w-4 h-4 mr-2" />
                    Cerrar Caja
                  </Button>
                </form>
              </>
            )}

            {todayClosure.status === "closed" && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between">
                  <span>Efectivo real:</span>
                  <span className="font-bold">${(todayClosure.actualCash || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Diferencia:</span>
                  <span className={`font-bold ${(todayClosure.difference || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(todayClosure.difference || 0) >= 0 ? "+" : ""}{(todayClosure.difference || 0).toLocaleString()}
                  </span>
                </div>
                {todayClosure.notes && (
                  <p className="text-sm text-gray-500">Notas: {todayClosure.notes}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      <div>
        <h3 className="text-lg font-bold mb-3">Histórico de Cierres</h3>
        <div className="bg-white rounded-lg border">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Apertura</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Ventas</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Diferencia</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {closures?.map((closure) => (
                <tr key={closure.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{closure.date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${closure.status === "open" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {closure.status === "open" ? "Abierta" : "Cerrada"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">${(closure.openingAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">${(closure.cashSales || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={(closure.difference || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                      {(closure.difference || 0) >= 0 ? "+" : ""}{(closure.difference || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => { if (confirm("¿Eliminar este cierre?")) deleteMutation.mutate({ id: closure.id }); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Payment Dialog */}
      <Dialog open={registerDialog} onOpenChange={setRegisterDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar pago en efectivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!selectedGuardian ? (
              <div className="space-y-2">
                <Label>Buscar tutor por DNI</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchDni}
                    onChange={(e) => setSearchDni(e.target.value)}
                    placeholder="Ingrese DNI"
                  />
                  <Button variant="outline" size="icon">
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                {guardianSearch && (
                  <div 
                    className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedGuardian(guardianSearch)}
                  >
                    <p className="font-semibold">{guardianSearch.name}</p>
                    <p className="text-sm text-gray-500">DNI: {guardianSearch.dni}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedGuardian.name}</p>
                    <p className="text-sm text-gray-500">DNI: {selectedGuardian.dni}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setSelectedGuardian(null);
                    setSelectedQuotas([]);
                  }}>
                    Cambiar
                  </Button>
                </div>

                {pendingQuotas && pendingQuotas.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Cuotas pendientes:</p>
                    {pendingQuotas.map((q) => (
                      <div key={q.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          checked={selectedQuotas.includes(q.id)}
                          onChange={(e) => {
                            setSelectedQuotas(prev => 
                              e.target.checked 
                                ? [...prev, q.id] 
                                : prev.filter(id => id !== q.id)
                            );
                          }}
                        />
                        <span className="flex-1 text-sm">{q.playerName} - {q.month}/{q.year}</span>
                        <span className="font-mono font-semibold">${q.totalAmount.toLocaleString()}</span>
                      </div>
                    ))}
                    
                    <div className="bg-gray-100 p-3 rounded flex justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold font-mono">
                        ${pendingQuotas
                          .filter(q => selectedQuotas.includes(q.id))
                          .reduce((s, q) => s + q.totalAmount, 0)
                          .toLocaleString()}
                      </span>
                    </div>

                    <Button 
                      className="w-full bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
                      disabled={selectedQuotas.length === 0 || registerPayment.isPending}
                      onClick={() => {
                        registerPayment.mutate({
                          guardianId: selectedGuardian.id,
                          quotaIds: selectedQuotas,
                          paymentMethod: "cash",
                          notes: `Pago en efectivo registrado desde cierre de caja`,
                        });
                      }}
                    >
                      {registerPayment.isPending ? "Procesando..." : "Confirmar pago en efectivo"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p>No hay cuotas pendientes</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}