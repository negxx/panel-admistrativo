import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Search,
  Plus,
  CreditCard,
  ChevronRight,
  MessageCircle,
  Receipt,
  Baby,
} from "lucide-react";
import { toast } from "sonner";

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

export default function Familias() {
  const [search, setSearch] = useState("");
  const [selectedGuardianId, setSelectedGuardianId] = useState<number | null>(null);
  const [newGuardianDialog, setNewGuardianDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedChildrenQuotas, setSelectedChildrenQuotas] = useState<Record<number, number[]>>({});
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "mercadopago">("cash");
  const [guardianForm, setGuardianForm] = useState({ name: "", dni: "", phone: "", email: "", address: "" });

  const utils = trpc.useUtils();
  const { data: guardiansData } = trpc.guardian.list.useQuery({ search: search || undefined, page: 1, pageSize: 50 });
  const { data: selectedGuardian } = trpc.guardian.getById.useQuery(
    { id: selectedGuardianId! },
    { enabled: !!selectedGuardianId }
  );

  const createGuardian = trpc.guardian.create.useMutation({
    onSuccess: () => {
      toast.success("Tutor agregado");
      setNewGuardianDialog(false);
      setGuardianForm({ name: "", dni: "", phone: "", email: "", address: "" });
      utils.guardian.list.invalidate();
    },
  });

  const registerFamilyPayment = trpc.payment.registerFamily.useMutation({
    onSuccess: () => {
      toast.success("Pago familiar registrado");
      setPaymentDialog(false);
      setSelectedChildrenQuotas({});
      utils.guardian.getById.invalidate({ id: selectedGuardianId! });
      utils.quota.list.invalidate();
    },
  });

  const calculateTotal = () => {
    let total = 0;
    for (const [childId, quotaIds] of Object.entries(selectedChildrenQuotas)) {
      const child = selectedGuardian?.children.find(c => c.id === Number(childId));
      if (child) {
        for (const qId of quotaIds) {
          const quota = child.quotas.find(q => q.id === qId);
          if (quota) total += quota.totalAmount;
        }
      }
    }
    return total;
  };

  const anySelected = Object.values(selectedChildrenQuotas).some(arr => arr.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a2e]">Familias</h2>
          <p className="text-sm text-gray-500">Gestion de tutores y pagos por hijo</p>
        </div>
        <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => setNewGuardianDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo Tutor
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Guardian List */}
        <Card className="lg:col-span-2 border border-gray-200">
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Buscar tutor..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {guardiansData?.guardians.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGuardianId(g.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    selectedGuardianId === g.id ? "bg-[#ffc107]/5 border-l-2 border-l-[#ffc107]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#1a237e] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {g.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{g.name}</p>
                      <p className="text-xs text-gray-400">DNI: {g.dni} | {g.playerCount} hijo(s)</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
              {guardiansData && guardiansData.guardians.length === 0 && (
                <p className="py-8 text-center text-gray-400 text-sm">No se encontraron tutores</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Guardian Detail */}
        <Card className="lg:col-span-3 border border-gray-200">
          {selectedGuardian ? (
            <>
              <CardHeader className="pb-3 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#1a237e] flex items-center justify-center text-white font-bold text-lg">
                      {selectedGuardian.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{selectedGuardian.name}</CardTitle>
                      <p className="text-sm text-gray-500">DNI: {selectedGuardian.dni} | {selectedGuardian.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedGuardian.phone && (
                      <a href={`https://wa.me/${selectedGuardian.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm"><MessageCircle className="w-4 h-4 text-green-600" /></Button>
                      </a>
                    )}
                    {anySelected && (
                      <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => setPaymentDialog(true)}>
                        <CreditCard className="w-4 h-4 mr-1" /> Pagar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Children */}
                {selectedGuardian.children.map((child) => {
                  const pending = child.quotas.filter(q => q.status === "pending" || q.status === "overdue");
                  const totalPending = pending.reduce((s, q) => s + q.totalAmount, 0);
                  return (
                    <div key={child.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Baby className="w-4 h-4 text-[#1a237e]" />
                          <span className="font-semibold text-sm">{child.name}</span>
                          <Badge variant="outline" className="text-xs">Cat. {child.category}</Badge>
                        </div>
                        <span className="text-sm font-mono font-semibold text-red-600">
                          {totalPending > 0 ? `${formatMoney(totalPending)} pend.` : "Al dia"}
                        </span>
                      </div>

                      {pending.length > 0 ? (
                        <div className="space-y-1.5">
                          {pending.map((q) => (
                            <div key={q.id} className="flex items-center gap-3 py-1.5 px-2 bg-gray-50 rounded text-xs">
                              <Checkbox
                                checked={(selectedChildrenQuotas[child.id] ?? []).includes(q.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedChildrenQuotas(prev => {
                                    const current = prev[child.id] ?? [];
                                    if (checked) {
                                      return { ...prev, [child.id]: [...current, q.id] };
                                    }
                                    return { ...prev, [child.id]: current.filter(id => id !== q.id) };
                                  });
                                }}
                              />
                              <span className="flex-1">{q.month}/{q.year}</span>
                              <span className="text-gray-500">Vence: {q.dueDate}</span>
                              <Badge variant="outline" className={`text-xs ${q.status === "overdue" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                                {q.status === "overdue" ? "Vencida" : "Pendiente"}
                              </Badge>
                              <span className="font-mono font-semibold min-w-[80px] text-right">{formatMoney(q.totalAmount)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-green-600 py-1">No hay cuotas pendientes</p>
                      )}
                    </div>
                  );
                })}

                {/* Payment History */}
                {selectedGuardian.payments.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Receipt className="w-4 h-4" /> Historial de Pagos
                    </h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedGuardian.payments.slice(-5).reverse().map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs">
                          <span>{p.paymentDate}</span>
                          <Badge variant="outline" className="text-xs capitalize">{p.paymentMethod}</Badge>
                          <span className="font-mono font-semibold">{formatMoney(p.totalAmount)}</span>
                          <span className="text-gray-400">{p.receiptNumber ?? "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Seleccione un tutor para ver el detalle</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* New Guardian Dialog */}
      <Dialog open={newGuardianDialog} onOpenChange={setNewGuardianDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo Tutor</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nombre</Label><Input value={guardianForm.name} onChange={(e) => setGuardianForm({ ...guardianForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>DNI</Label><Input value={guardianForm.dni} onChange={(e) => setGuardianForm({ ...guardianForm, dni: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Telefono</Label><Input value={guardianForm.phone} onChange={(e) => setGuardianForm({ ...guardianForm, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={guardianForm.email} onChange={(e) => setGuardianForm({ ...guardianForm, email: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Direccion</Label><Input value={guardianForm.address} onChange={(e) => setGuardianForm({ ...guardianForm, address: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewGuardianDialog(false)}>Cancelar</Button>
              <Button className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => createGuardian.mutate(guardianForm)}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pago Familiar</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-500">Cuotas seleccionadas:</p>
              {selectedGuardian?.children.map(child => {
                const quotas = selectedChildrenQuotas[child.id] ?? [];
                if (quotas.length === 0) return null;
                const childTotal = child.quotas.filter(q => quotas.includes(q.id)).reduce((s, q) => s + q.totalAmount, 0);
                return (
                  <div key={child.id} className="flex justify-between text-sm mt-1">
                    <span>{child.name} ({quotas.length} cuota{quotas.length > 1 ? 's' : ''})</span>
                    <span className="font-mono font-medium">{formatMoney(childTotal)}</span>
                  </div>
                );
              })}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold font-mono text-lg">{formatMoney(calculateTotal())}</span>
              </div>
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
              <Button
                className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
                onClick={() => {
                  const selections = Object.entries(selectedChildrenQuotas)
                    .filter(([, qIds]) => qIds.length > 0)
                    .map(([playerId, quotaIds]) => ({ playerId: Number(playerId), quotaIds }));
                  registerFamilyPayment.mutate({
                    guardianId: selectedGuardianId!,
                    playerSelections: selections,
                    paymentMethod,
                  });
                }}
                disabled={registerFamilyPayment.isPending}
              >
                Confirmar Pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
