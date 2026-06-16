import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Baby,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Clock,
  LogOut,
  User,
} from "lucide-react";
import { toast } from "sonner";

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

// Tipo para cuotas pendientes (unificado)
type PendingQuota = {
  id: number;
  playerId: number;
  playerName: string | null;
  month: number;
  year: number;
  baseAmount: number;
  discountAmount: number | null;
  interestAmount: number | null;
  totalAmount: number;
  dueDate: string;
  status: string;
};

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [guardianId, setGuardianId] = useState<number | null>(null);
  const [isPlayer, setIsPlayer] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedQuotas, setSelectedQuotas] = useState<number[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "mercadopago">("mercadopago");

  useEffect(() => {
    const stored = localStorage.getItem("portalGuardianId");
    const storedIsPlayer = localStorage.getItem("portalIsPlayer");
    if (stored) {
      setGuardianId(Number(stored));
      setIsPlayer(storedIsPlayer === "true");
    } else {
      navigate("/portal");
    }
  }, [navigate]);

  const utils = trpc.useUtils();

  // Queries para TUTOR
  const { data: children } = trpc.portal.getMyChildren.useQuery(
    { guardianId: guardianId! },
    { enabled: !!guardianId && !isPlayer }
  );
  const { data: pendingQuotasTutor } = trpc.portal.getPendingQuotas.useQuery(
    { guardianId: guardianId! },
    { enabled: !!guardianId && !isPlayer }
  );

  // Queries para JUGADOR
  const { data: myQuotas } = trpc.portal.getMyQuotas.useQuery(
    { playerId: guardianId! },
    { enabled: !!guardianId && isPlayer }
  );

  // Historial de pagos (usa guardianId para ambos)
  const { data: paymentHistory } = trpc.portal.getPaymentHistory.useQuery(
    { guardianId: guardianId! },
    { enabled: !!guardianId }
  );

  // Mutations
  const payQuotas = trpc.portal.payQuotas.useMutation({
    onSuccess: () => {
      toast.success("Pago registrado correctamente!");
      setPaymentDialog(false);
      setSelectedQuotas([]);
      utils.portal.getMyChildren.invalidate();
      utils.portal.getPendingQuotas.invalidate();
      utils.portal.getPaymentHistory.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const payPlayerQuotas = trpc.portal.payPlayerQuotas.useMutation({
    onSuccess: () => {
      toast.success("Pago registrado correctamente!");
      setPaymentDialog(false);
      setSelectedQuotas([]);
      utils.portal.getMyQuotas.invalidate();
      utils.portal.getPaymentHistory.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogout = () => {
    localStorage.removeItem("portalGuardianId");
    localStorage.removeItem("portalIsPlayer");
    navigate("/portal");
  };

  if (!guardianId) return null;

  // Datos unificados
  const allPending: PendingQuota[] = isPlayer
    ? (myQuotas?.pendingQuotas ?? []).map(q => ({
        ...q,
        playerName: myQuotas?.player?.name ?? "Socio",
      }))
    : (pendingQuotasTutor ?? []);

  const totalPending = isPlayer
    ? (myQuotas?.totalPending ?? 0)
    : allPending.reduce((s, q) => s + q.totalAmount, 0);

  // Agrupar por hijo (solo para tutor)
  const groupedByChild = !isPlayer
    ? allPending.reduce<Record<number, PendingQuota[]>>((acc, q) => {
        if (!acc[q.playerId]) acc[q.playerId] = [];
        acc[q.playerId].push(q);
        return acc;
      }, {})
    : {};

  // Handler de pago unificado
  const handlePayment = () => {
    if (selectedQuotas.length === 0) return;

    if (isPlayer) {
      payPlayerQuotas.mutate({
        playerId: guardianId,
        quotaIds: selectedQuotas,
        paymentMethod,
      });
    } else {
      payQuotas.mutate({
        guardianId,
        quotaIds: selectedQuotas,
        paymentMethod,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Mi Cuenta</h2>
          <p className="text-white/70">
            {isPlayer ? "Gestion de mis cuotas" : "Gestion de cuotas y pagos"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-white/70 hover:text-white hover:bg-white/10"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-1" /> Salir
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 bg-white/10 backdrop-blur text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                {isPlayer ? <User className="w-5 h-5" /> : <Baby className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm text-white/60">
                  {isPlayer ? "Mi Categoria" : "Mis Hijos"}
                </p>
                <p className="text-xl font-bold">
                  {isPlayer ? (myQuotas?.player?.category ?? "-") : (children?.length ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/10 backdrop-blur text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-300" />
              </div>
              <div>
                <p className="text-sm text-white/60">Pendiente</p>
                <p className="text-xl font-bold font-mono">{formatMoney(totalPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pay Button */}
      {allPending.length > 0 && (
        <Button
          className="w-full h-14 bg-[#ffc107] hover:bg-[#e6af06] text-[#1a237e] text-lg font-bold shadow-lg"
          onClick={() => setPaymentDialog(true)}
        >
          <CreditCard className="w-5 h-5 mr-2" /> Pagar Cuotas
        </Button>
      )}

      {/* Content: JUGADOR */}
      {isPlayer && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Mis Cuotas</h3>
          {myQuotas?.pendingQuotas && myQuotas.pendingQuotas.length > 0 ? (
            <Card className="border-0 bg-white/95 backdrop-blur">
              <CardContent className="pt-4">
                <div className="space-y-1.5">
                  {myQuotas.pendingQuotas.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {q.status === "overdue" ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-orange-500" />
                        )}
                        <span>
                          {q.month}/{q.year}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400">Vence: {q.dueDate}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            q.status === "overdue"
                              ? "text-red-600 border-red-200"
                              : "text-orange-600 border-orange-200"
                          }`}
                        >
                          {q.status === "overdue" ? "Vencida" : "Pendiente"}
                        </Badge>
                        <span className="font-mono font-semibold min-w-[70px] text-right">
                          {formatMoney(q.totalAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 bg-white/95 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Todas las cuotas estan al dia</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Content: TUTOR */}
      {!isPlayer && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Mis Hijos</h3>
          {children?.map((child) => {
            const childPending = child.pendingQuotas;
            return (
              <Card key={child.id} className="border-0 bg-white/95 backdrop-blur">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#1a237e] flex items-center justify-center text-white font-bold text-sm">
                        {child.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <CardTitle className="text-base">{child.name}</CardTitle>
                        <p className="text-xs text-gray-500">
                          Categoria {child.category} | DNI: {child.dni}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        child.totalPending > 0
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700"
                      }
                    >
                      {child.totalPending > 0
                        ? `${formatMoney(child.totalPending)}`
                        : "Al dia"}
                    </Badge>
                  </div>
                </CardHeader>
                {childPending.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {childPending.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {q.status === "overdue" ? (
                              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-orange-500" />
                            )}
                            <span>
                              {q.month}/{q.year}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">Vence: {q.dueDate}</span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                q.status === "overdue"
                                  ? "text-red-600 border-red-200"
                                  : "text-orange-600 border-orange-200"
                              }`}
                            >
                              {q.status === "overdue" ? "Vencida" : "Pendiente"}
                            </Badge>
                            <span className="font-mono font-semibold min-w-[70px] text-right">
                              {formatMoney(q.totalAmount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
                {childPending.length === 0 && (
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 py-2 px-2 text-xs text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Todas las cuotas estan al dia</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment History */}
      {paymentHistory && paymentHistory.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Historial de Pagos</h3>
          <Card className="border-0 bg-white/95 backdrop-blur">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">
                        Fecha
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">
                        Detalle
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        Monto
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">
                        Recibo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 px-4 text-gray-500">{p.paymentDate}</td>
                        <td className="py-3 px-4">
                          <div className="text-xs text-gray-500">
                            {p.quotas
                              .map((q) => `${q.playerName} (${q.month}/${q.year})`)
                              .join(", ")}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-green-600">
                          {formatMoney(p.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {p.receiptNumber ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pagar Cuotas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              Seleccione las cuotas que desea pagar:
            </p>

            {/* JUGADOR: cuotas directas */}
            {isPlayer &&
              myQuotas?.pendingQuotas &&
              myQuotas.pendingQuotas.length > 0 && (
                <div className="space-y-1.5">
                  {myQuotas.pendingQuotas.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded text-xs"
                    >
                      <Checkbox
                        checked={selectedQuotas.includes(q.id)}
                        onCheckedChange={(checked) => {
                          setSelectedQuotas((prev) =>
                            checked
                              ? [...prev, q.id]
                              : prev.filter((id) => id !== q.id)
                          );
                        }}
                      />
                      <span className="flex-1">
                        {q.month}/{q.year}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          q.status === "overdue"
                            ? "text-red-600 border-red-200"
                            : "text-orange-600 border-orange-200"
                        }`}
                      >
                        {q.status === "overdue" ? "Vencida" : "Pendiente"}
                      </Badge>
                      <span className="font-mono font-semibold min-w-[70px] text-right">
                        {formatMoney(q.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {/* TUTOR: cuotas agrupadas por hijo */}
            {!isPlayer &&
              Object.entries(groupedByChild).map(([childId, quotas]) => {
                const child = children?.find((c) => c.id === Number(childId));
                if (!child) return null;
                const childSelected = selectedQuotas.filter((sq) =>
                  quotas.some((q) => q.id === sq)
                );
                return (
                  <div
                    key={childId}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Baby className="w-4 h-4 text-[#1a237e]" />
                      <span className="font-semibold text-sm">{child.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {childSelected.length}/{quotas.length}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {quotas.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded text-xs"
                        >
                          <Checkbox
                            checked={selectedQuotas.includes(q.id)}
                            onCheckedChange={(checked) => {
                              setSelectedQuotas((prev) =>
                                checked
                                  ? [...prev, q.id]
                                  : prev.filter((id) => id !== q.id)
                              );
                            }}
                          />
                          <span className="flex-1">
                            {q.month}/{q.year}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              q.status === "overdue"
                                ? "text-red-600 border-red-200"
                                : "text-orange-600 border-orange-200"
                            }`}
                          >
                            {q.status === "overdue" ? "Vencida" : "Pendiente"}
                          </Badge>
                          <span className="font-mono font-semibold min-w-[70px] text-right">
                            {formatMoney(q.totalAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
              <span className="font-semibold">Total a pagar:</span>
              <span className="text-xl font-bold font-mono">
                {formatMoney(
                  allPending
                    .filter((q) => selectedQuotas.includes(q.id))
                    .reduce((s, q) => s + q.totalAmount, 0)
                )}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Metodo de pago</label>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(v as "transfer" | "mercadopago")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mercadopago">MercadoPago (online)</SelectItem>
                  <SelectItem value="transfer">Transferencia bancaria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "transfer" && (
              <div className="bg-blue-50 p-3 rounded text-xs space-y-1">
                <p className="font-semibold text-blue-800">
                  Datos para transferencia:
                </p>
                <p>Banco: Banco Nacion</p>
                <p>CBU: 0110123456789012345678</p>
                <p>Alias: CLUB.ATLETICO.PAGO</p>
                <p>Cuenta: Caja de Ahorro $</p>
                <p className="text-blue-600 mt-1">
                  Enviar comprobante por WhatsApp
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPaymentDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]"
                disabled={
                  selectedQuotas.length === 0 ||
                  (isPlayer
                    ? payPlayerQuotas.isPending
                    : payQuotas.isPending)
                }
                onClick={handlePayment}
              >
                {isPlayer
                  ? payPlayerQuotas.isPending
                    ? "Procesando..."
                    : "Confirmar Pago"
                  : payQuotas.isPending
                  ? "Procesando..."
                  : "Confirmar Pago"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}