import { useState } from "react";
import { toast } from "sonner";
import { Eye, KeyRound, Pencil, Plus, Receipt, Search, Trash2, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CobrarDialog, type CobrarPayer } from "@/components/CobrarDialog";
import {
  EmptyRow,
  LoadingRows,
  PageHeader,
  Pagination,
  PaymentStatusBadge,
} from "@/components/ui-kit";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";

/**
 * Familias (tutores).
 *
 * La lista ahora muestra la deuda familiar consolidada y si la familia ya activó
 * su acceso al portal. La baja de un tutor está protegida: si todavía tiene
 * socios o pagos asociados, el backend la rechaza en vez de dejar registros
 * huérfanos.
 */

const emptyForm = {
  name: "",
  dni: "",
  phone: "",
  email: "",
  address: "",
  whatsappEnabled: true,
};

export default function Familias() {
  const [search, setSearch] = useState("");
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [payer, setPayer] = useState<CobrarPayer | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.guardian.list.useQuery({
    search: search || undefined,
    onlyDebtors: onlyDebtors || undefined,
    page,
    pageSize: 25,
  });

  const { data: viewing } = trpc.guardian.getById.useQuery(
    { id: viewingId ?? 0 },
    { enabled: viewingId !== null },
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const create = trpc.guardian.create.useMutation({
    onSuccess: () => {
      toast.success("Tutor creado");
      closeForm();
      utils.guardian.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.guardian.update.useMutation({
    onSuccess: () => {
      toast.success("Datos actualizados");
      closeForm();
      utils.guardian.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.guardian.delete.useMutation({
    onSuccess: () => {
      toast.success("Tutor eliminado");
      utils.guardian.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetPin = trpc.guardian.resetPortalPin.useMutation({
    onSuccess: () => {
      toast.success("PIN blanqueado. La familia puede volver a activarlo desde el portal.");
      utils.guardian.invalidate();
    },
  });

  const submit = () => {
    const payload = {
      ...form,
      email: form.email || undefined,
      address: form.address || undefined,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  };

  const guardians = data?.guardians ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Familias"
        subtitle="Tutores responsables y su estado de cuenta"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nuevo tutor
          </Button>
        }
      />

      <Card className="border border-gray-200">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o DNI…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
            <Checkbox
              checked={onlyDebtors}
              onCheckedChange={(v) => {
                setOnlyDebtors(Boolean(v));
                setPage(1);
              }}
            />
            Sólo con deuda
          </label>
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-600">
                  <th className="px-4 py-3 font-semibold">Tutor</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 text-center font-semibold">Socios</th>
                  <th className="px-4 py-3 text-right font-semibold">Deuda</th>
                  <th className="px-4 py-3 font-semibold">Portal</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRows colSpan={6} />}
                {!isLoading && guardians.length === 0 && (
                  <EmptyRow colSpan={6} message="No hay tutores cargados." />
                )}
                {guardians.map((guardian) => (
                  <tr key={guardian.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{guardian.name}</p>
                      <p className="text-xs text-gray-400">DNI {guardian.dni}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{guardian.phone}</p>
                      {guardian.email && (
                        <p className="text-xs text-gray-400">{guardian.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {guardian.playerCount}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {guardian.debtAmount > 0 ? (
                        <span className="font-semibold text-red-600">
                          {formatMoney(guardian.debtAmount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {guardian.hasPortalAccess ? (
                        <Badge variant="outline" className="border-green-200 text-green-700">
                          Activado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-gray-200 text-gray-500">
                          Sin activar
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewingId(guardian.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPayer({ kind: "guardian", id: guardian.id, name: guardian.name })
                          }
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(guardian.id);
                            setForm({
                              name: guardian.name,
                              dni: guardian.dni,
                              phone: guardian.phone,
                              email: guardian.email ?? "",
                              address: guardian.address ?? "",
                              whatsappEnabled: guardian.whatsappEnabled ?? true,
                            });
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {guardian.hasPortalAccess && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Blanquear PIN del portal"
                            onClick={() => resetPin.mutate({ id: guardian.id })}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => remove.mutate({ id: guardian.id })}
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

      {/* Alta / edición */}
      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar tutor" : "Nuevo tutor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre y apellido</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>DNI</Label>
                <Input
                  inputMode="numeric"
                  value={form.dni}
                  onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+549…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium">Recibe avisos por WhatsApp</p>
                <p className="text-xs text-gray-500">Se usa en la pantalla de deudores.</p>
              </div>
              <Switch
                checked={form.whatsappEnabled}
                onCheckedChange={(v) => setForm({ ...form, whatsappEnabled: v })}
              />
            </div>
            <p className="rounded bg-blue-50 p-3 text-xs text-blue-800">
              El PIN del portal lo elige la familia la primera vez que entra, validando la fecha de
              nacimiento del socio. Desde acá no se carga.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                disabled={!form.name || !form.dni || !form.phone || create.isPending || update.isPending}
              >
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ficha de la familia */}
      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                <span className="font-medium">Deuda familiar</span>
                <span className="font-mono font-bold text-red-600">
                  {formatMoney(viewing.debtAmount)}
                </span>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Socios a cargo</p>
                <div className="space-y-2">
                  {viewing.children.length === 0 && (
                    <p className="text-sm text-gray-400">No tiene socios asociados.</p>
                  )}
                  {viewing.children.map((child) => {
                    const pending = child.quotas.filter((q) => q.status !== "paid");
                    return (
                      <div key={child.id} className="rounded-lg border border-gray-100 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{child.name}</p>
                            <p className="text-xs text-gray-400">
                              Categoría {child.category} · DNI {child.dni}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              pending.length > 0
                                ? "border-red-200 text-red-700"
                                : "border-green-200 text-green-700"
                            }
                          >
                            {pending.length > 0 ? `${pending.length} impaga(s)` : "Al día"}
                          </Badge>
                        </div>
                        {pending.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {pending.map((quota) => (
                              <Badge key={quota.id} variant="outline" className="text-xs">
                                {formatPeriod(quota.month, quota.year)} ·{" "}
                                {formatMoney(quota.totalAmount)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Últimos pagos</p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <tbody>
                      {viewing.payments.length === 0 && (
                        <EmptyRow colSpan={4} message="Sin pagos registrados." />
                      )}
                      {viewing.payments.map((payment) => (
                        <tr key={payment.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-500">
                            {formatDate(payment.paymentDate)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatMoney(payment.totalAmount)}
                          </td>
                          <td className="px-3 py-2">
                            <PaymentStatusBadge status={payment.status} />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">
                            {payment.receiptNumber ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CobrarDialog
        payer={payer}
        open={payer !== null}
        onOpenChange={(open) => !open && setPayer(null)}
      />
    </div>
  );
}
