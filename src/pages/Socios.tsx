import { useState } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALL_FILTER } from "@contracts/constants";
import {
  EmptyRow,
  LoadingRows,
  PageHeader,
  Pagination,
  QuotaStatusBadge,
} from "@/components/ui-kit";
import { ageFromBirthDate, formatDate, formatMoney, formatPeriod } from "@/lib/format";

/**
 * Socios deportivos.
 *
 * Arreglos:
 *  - El filtro "Todos" mandaba el texto `"all"` como estado, que no pasa la
 *    validación del backend: la query fallaba y la tabla no cargaba nunca.
 *  - La columna de estado mostraba la última cuota, que no dice nada de la
 *    deuda. Ahora muestra la deuda real acumulada.
 *  - El alta valida DNI duplicado y que la categoría exista antes de guardar.
 */

const emptyForm = {
  name: "",
  dni: "",
  birthDate: "",
  address: "",
  phone: "",
  email: "",
  category: "",
  quotaType: "deportivo" as "deportivo" | "hermanos" | "individual",
  guardianId: null as number | null,
  notes: "",
  generateCurrentQuota: true,
};

export default function Socios() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_FILTER);
  const [status, setStatus] = useState(ALL_FILTER);
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.player.list.useQuery({
    search: search || undefined,
    category: category === ALL_FILTER ? undefined : category,
    status: status === ALL_FILTER ? undefined : (status as "active" | "inactive"),
    onlyDebtors: onlyDebtors || undefined,
    page,
    pageSize: 25,
  });

  const { data: categories } = trpc.category.list.useQuery();
  const { data: guardianData } = trpc.guardian.list.useQuery({ page: 1, pageSize: 200 });
  const { data: viewing } = trpc.player.getById.useQuery(
    { id: viewingId ?? 0 },
    { enabled: viewingId !== null },
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const create = trpc.player.create.useMutation({
    onSuccess: () => {
      toast.success("Socio dado de alta");
      closeForm();
      utils.player.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.player.update.useMutation({
    onSuccess: () => {
      toast.success("Socio actualizado");
      closeForm();
      utils.player.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deactivate = trpc.player.delete.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.pendingQuotas > 0
          ? `Socio dado de baja. Ojo: quedan ${result.pendingQuotas} cuota(s) impagas.`
          : "Socio dado de baja",
      );
      utils.player.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reactivate = trpc.player.reactivate.useMutation({
    onSuccess: () => {
      toast.success("Socio reactivado");
      utils.player.invalidate();
    },
  });

  const submit = () => {
    const { generateCurrentQuota, ...common } = form;
    const payload = {
      ...common,
      address: common.address || undefined,
      phone: common.phone || undefined,
      email: common.email || undefined,
      notes: common.notes || undefined,
    };
    // `generateCurrentQuota` sólo aplica al alta: en la edición no se toca la
    // cuota que ya se generó.
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate({ ...payload, generateCurrentQuota });
  };

  const openEdit = (player: NonNullable<typeof data>["players"][number]) => {
    setEditingId(player.id);
    setForm({
      ...emptyForm,
      name: player.name,
      dni: player.dni,
      birthDate: player.birthDate,
      phone: player.phone ?? "",
      email: player.email ?? "",
      category: player.category,
      quotaType: (player.quotaType ?? "deportivo") as typeof emptyForm.quotaType,
      guardianId: player.guardianId,
    });
    setFormOpen(true);
  };

  const players = data?.players ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Socios deportivos"
        subtitle="Altas, bajas y estado de cuenta de cada socio"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nuevo socio
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
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>

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
                  <th className="px-4 py-3 font-semibold">Socio</th>
                  <th className="px-4 py-3 font-semibold">Cat.</th>
                  <th className="px-4 py-3 font-semibold">Tutor</th>
                  <th className="px-4 py-3 text-right font-semibold">Deuda</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRows colSpan={6} />}
                {!isLoading && players.length === 0 && (
                  <EmptyRow colSpan={6} message="No hay socios que coincidan con la búsqueda." />
                )}
                {players.map((player) => (
                  <tr key={player.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{player.name}</p>
                      <p className="text-xs text-gray-400">
                        DNI {player.dni}
                        {ageFromBirthDate(player.birthDate) !== null && (
                          <> · {ageFromBirthDate(player.birthDate)} años</>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{player.category}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {player.guardianName ?? (
                        <span className="text-xs text-gray-400">Sin tutor</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {player.debtAmount > 0 ? (
                        <span className="font-semibold text-red-600">
                          {formatMoney(player.debtAmount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {player.status === "inactive" ? (
                        <Badge variant="outline" className="border-gray-200 text-gray-500">
                          Inactivo
                        </Badge>
                      ) : player.debtStatus === "overdue" ? (
                        <Badge variant="outline" className="border-red-200 text-red-700">
                          {player.overdueCount} vencida(s)
                        </Badge>
                      ) : player.debtStatus === "pending" ? (
                        <Badge variant="outline" className="border-orange-200 text-orange-700">
                          {player.pendingCount} pendiente(s)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-green-200 text-green-700">
                          Al día
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewingId(player.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(player)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {player.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => deactivate.mutate({ id: player.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600"
                            onClick={() => reactivate.mutate({ id: player.id })}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                        )}
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
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar socio" : "Nuevo socio"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Field label="Nombre y apellido" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="DNI">
              <Input
                inputMode="numeric"
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <Input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              />
            </Field>
            <Field label="Categoría">
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir…" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                      {!c.paysQuota && " (no paga cuota)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tutor a cargo">
              <Select
                value={form.guardianId ? String(form.guardianId) : "none"}
                onValueChange={(v) =>
                  setForm({ ...form, guardianId: v === "none" ? null : Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin tutor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin tutor (socio mayor)</SelectItem>
                  {(guardianData?.guardians ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Teléfono">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Observaciones" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            {!editingId && (
              <label className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm sm:col-span-2">
                <Checkbox
                  checked={form.generateCurrentQuota}
                  onCheckedChange={(v) => setForm({ ...form, generateCurrentQuota: Boolean(v) })}
                />
                Generar la cuota del mes en curso
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={
                !form.name ||
                !form.dni ||
                !form.birthDate ||
                !form.category ||
                create.isPending ||
                update.isPending
              }
            >
              {editingId ? "Guardar cambios" : "Dar de alta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ficha del socio */}
      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 pt-2">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Info label="DNI" value={viewing.dni} />
                <Info label="Nacimiento" value={formatDate(viewing.birthDate)} />
                <Info label="Categoría" value={viewing.category} />
                <Info label="Alta" value={formatDate(viewing.registrationDate)} />
                <Info label="Teléfono" value={viewing.phone ?? "—"} />
                <Info label="Email" value={viewing.email ?? "—"} />
                <Info label="Tutor" value={viewing.guardian?.name ?? "Sin tutor"} />
                <Info
                  label="Acceso al portal"
                  value={
                    viewing.guardian
                      ? viewing.guardian.hasPortalAccess
                        ? "Activado (por el tutor)"
                        : "Sin activar"
                      : viewing.hasPortalAccess
                        ? "Activado"
                        : "Sin activar"
                  }
                />
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Deuda actual</span>
                  <span className="font-mono font-bold text-red-600">
                    {formatMoney(viewing.debtAmount)}
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Historial de cuotas</p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <tbody>
                      {viewing.quotas.length === 0 && (
                        <EmptyRow colSpan={4} message="Todavía no tiene cuotas generadas." />
                      )}
                      {viewing.quotas.map((quota) => (
                        <tr key={quota.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2">{formatPeriod(quota.month, quota.year)}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatMoney(quota.totalAmount)}
                          </td>
                          <td className="px-3 py-2">
                            <QuotaStatusBadge status={quota.status} />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">
                            {quota.receiptNumber ?? ""}
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
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
