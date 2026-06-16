import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Categorias() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    paysQuota: true,
    baseAmount: "",
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.category.list.useQuery();

  const createMutation = trpc.category.create.useMutation({
    onSuccess: () => {
      toast.success("Categoria creada");
      setDialogOpen(false);
      resetForm();
      utils.category.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.category.update.useMutation({
    onSuccess: () => {
      toast.success("Categoria actualizada");
      setDialogOpen(false);
      resetForm();
      utils.category.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.category.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoria eliminada");
      utils.category.list.invalidate();
    },
  });

  const resetForm = () => {
    setFormData({ name: "", paysQuota: true, baseAmount: "", description: "" });
    setEditingId(null);
  };

  const handleSubmit = () => {
    const payload = {
      name: formData.name,
      paysQuota: formData.paysQuota,
      baseAmount: Number(formData.baseAmount) || 0,
      description: formData.description || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (category: { 
    id: number; 
    name: string; 
    paysQuota: boolean | null; 
    baseAmount: number | null; 
    description: string | null 
  }) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      paysQuota: category.paysQuota ?? true,
      baseAmount: String(category.baseAmount ?? 0),
      description: category.description ?? "",
    });
    setDialogOpen(true);
  };

  if (isLoading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Categorias</h2>
          <p className="text-gray-500">Gestion de categorias de jugadores</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Categoria" : "Nueva Categoria"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: 5ta, Primera, Reserva"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descripcion</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Paga cuota?</Label>
                  <p className="text-xs text-gray-500">Si esta activado, los jugadores de esta categoria pagan cuota mensual</p>
                </div>
                <Switch
                  checked={formData.paysQuota}
                  onCheckedChange={(v) => setFormData({ ...formData, paysQuota: v })}
                />
              </div>
              {formData.paysQuota && (
                <div className="space-y-1.5">
                  <Label>Monto base de cuota ($)</Label>
                  <Input
                    type="number"
                    value={formData.baseAmount}
                    onChange={(e) => setFormData({ ...formData, baseAmount: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Guardar" : "Crear"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories?.map((cat) => (
          <Card key={cat.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{cat.name}</CardTitle>
                <Badge variant={cat.paysQuota ? "default" : "secondary"}>
                  {cat.paysQuota ? "Paga cuota" : "No paga"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-500">{cat.description || "Sin descripcion"}</p>
              {cat.paysQuota && (
                <p className="text-sm font-medium">Monto: ${(cat.baseAmount ?? 0).toLocaleString()}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500"
                  onClick={() => { if (confirm("Eliminar esta categoria?")) deleteMutation.mutate({ id: cat.id }); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}