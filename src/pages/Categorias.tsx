import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyRow, PageHeader } from "@/components/ui-kit";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

/**
 * Categorías y montos de cuota.
 *
 * Esta tabla es ahora la **única fuente de verdad** de cuánto sale la cuota.
 * Antes convivía con `quota_configs`: el alta de socios leía una tabla y la
 * generación mensual, la otra, con montos distintos.
 *
 * El aviso de "categorías sin cargar" es nuevo: muestra las categorías que están
 * en uso por socios activos pero no existen acá, que son justamente las que la
 * generación mensual no puede cotizar.
 */

const emptyForm = {
  name: "",
  paysQuota: true,
  baseAmount: "",
  siblingDiscountPercent: "",
  description: "",
};

export default function Categorias() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.category.list.useQuery();
  const { data: missing } = trpc.category.missing.useQuery();

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const invalidate = () => {
    utils.category.invalidate();
    utils.player.invalidate();
    utils.quota.invalidate();
  };

  const create = trpc.category.create.useMutation({
    onSuccess: () => {
      toast.success("Categoría creada");
      closeDialog();
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.category.update.useMutation({
    onSuccess: () => {
      toast.success("Categoría actualizada");
      closeDialog();
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.category.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoría eliminada");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      paysQuota: form.paysQuota,
      baseAmount: Math.round(Number(form.baseAmount) || 0),
      siblingDiscountPercent: Math.round(Number(form.siblingDiscountPercent) || 0),
      description: form.description.trim() || undefined,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  };

  const openCreate = (prefillName = "") => {
    setForm({ ...emptyForm, name: prefillName });
    setEditingId(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categorías"
        subtitle="Cuánto paga cada categoría del club"
        actions={
          isAdmin && (
            <Button onClick={() => openCreate()}>
              <Plus className="mr-1 h-4 w-4" /> Nueva categoría
            </Button>
          )
        }
      />

      {missing && missing.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Hay socios en categorías que no están cargadas</p>
              <p className="text-amber-800">
                Mientras no existan acá, el sistema no sabe cuánto cobrarles y no les genera cuota.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {missing.map((row) => (
              <Button
                key={row.category}
                size="sm"
                variant="outline"
                className="border-amber-300 bg-white"
                onClick={() => isAdmin && openCreate(row.category)}
                disabled={!isAdmin}
              >
                {row.category} ({row.playerCount} socio{row.playerCount === 1 ? "" : "s"})
                {isAdmin && <Plus className="ml-1 h-3 w-3" />}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-600">
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 text-right font-semibold">Cuota</th>
                  <th className="px-4 py-3 text-right font-semibold">Desc. hermanos</th>
                  <th className="px-4 py-3 text-center font-semibold">Socios</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      Cargando…
                    </td>
                  </tr>
                )}
                {!isLoading && (categories ?? []).length === 0 && (
                  <EmptyRow
                    colSpan={5}
                    message="No hay categorías cargadas. Creá la primera para poder generar cuotas."
                  />
                )}
                {(categories ?? []).map((category) => (
                  <tr key={category.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.name}</span>
                        {!category.paysQuota && (
                          <Badge variant="outline" className="border-gray-200 text-xs text-gray-500">
                            No paga cuota
                          </Badge>
                        )}
                      </div>
                      {category.description && (
                        <p className="text-xs text-gray-400">{category.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {category.paysQuota ? formatMoney(category.baseAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {category.siblingDiscountPercent > 0
                        ? `${category.siblingDiscountPercent}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {category.playerCount}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(category.id);
                              setForm({
                                name: category.name,
                                paysQuota: category.paysQuota,
                                baseAmount: String(category.baseAmount),
                                siblingDiscountPercent: String(category.siblingDiscountPercent),
                                description: category.description ?? "",
                              });
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => remove.mutate({ id: category.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: 2014, 5ta, Primera"
              />
              {editingId && (
                <p className="text-xs text-gray-400">
                  Si cambiás el nombre, los socios de esta categoría se actualizan solos.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium">Paga cuota</p>
                <p className="text-xs text-gray-500">
                  Si está apagado, no se le generan cuotas a esta categoría.
                </p>
              </div>
              <Switch
                checked={form.paysQuota}
                onCheckedChange={(v) => setForm({ ...form, paysQuota: v })}
              />
            </div>

            {form.paysQuota && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Monto mensual</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.baseAmount}
                    onChange={(e) => setForm({ ...form, baseAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Descuento hermanos (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.siblingDiscountPercent}
                    onChange={(e) =>
                      setForm({ ...form, siblingDiscountPercent: e.target.value })
                    }
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-400">
                    Dejalo en 0 para usar el descuento general de Configuración.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={!form.name || create.isPending || update.isPending}>
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
