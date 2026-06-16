import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Plus,
  Pencil,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function formatMoney(amount: number | null) {
  if (amount === null) return "-";
  return `$ ${amount.toLocaleString("es-AR")}`;
}

const statusColors: Record<string, string> = {
  al_dia: "bg-green-100 text-green-700 border-green-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-orange-100 text-orange-700 border-orange-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
};

export default function Socios() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
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
  });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.player.list.useQuery({ search: search || undefined, category: category || undefined, status: status || undefined, page, pageSize: 25 });
  const { data: categories } = trpc.category.list.useQuery();
  const { data: guardianList } = trpc.guardian.list.useQuery({ page: 1, pageSize: 100 });

  const createMutation = trpc.player.create.useMutation({
    onSuccess: () => {
      toast.success("Socio creado correctamente");
      setDialogOpen(false);
      resetForm();
      utils.player.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.player.update.useMutation({
    onSuccess: () => {
      toast.success("Socio actualizado");
      setDialogOpen(false);
      resetForm();
      utils.player.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.player.delete.useMutation({
    onSuccess: () => {
      toast.success("Socio dado de baja");
      utils.player.list.invalidate();
    },
  });

  const resetForm = () => {
    setFormData({ name: "", dni: "", birthDate: "", address: "", phone: "", email: "", category: "", quotaType: "deportivo", guardianId: null, notes: "" });
    setEditingId(null);
  };

  const handleSubmit = () => {
    const payload = { ...formData, guardianId: formData.guardianId ?? undefined };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (player: { id: number; name: string; dni: string; birthDate: string; category: string;quotaType?: string | null;
 phone?: string | null; email?: string | null; address?: string | null; guardianId?: number | null; notes?: string | null }) => {
    setEditingId(player.id);
    setFormData({
  name: player.name,
  dni: player.dni,
  birthDate: player.birthDate,
  address: player.address ?? "",
  phone: player.phone ?? "",
  email: player.email ?? "",
  category: player.category,
  quotaType: (player.quotaType as "deportivo" | "hermanos" | "individual") ?? "deportivo",  // ← NUEVO
  guardianId: player.guardianId ?? null,
  notes: player.notes ?? "",
});
    setDialogOpen(true);
  };

  const exportToExcel = () => {
    if (!data?.players.length) return;
    const rows = data.players.map((p) => ({
      Nombre: p.name,
      DNI: p.dni,
      Categoria: p.category,
      Telefono: p.phone ?? "",
      Estado: p.status,
      "Estado Cuota": p.latestQuotaStatus ?? "Sin cuota",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Socios");
    XLSX.writeFile(wb, `socios_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Exportado a Excel");
  };

  const { data: viewPlayer } = trpc.player.getById.useQuery(
    { id: viewingId! },
    { enabled: !!viewingId }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a2e]">Socios Deportivos</h2>
          <p className="text-sm text-gray-500">Gestion de jugadores y familias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={() => { resetForm(); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Nuevo Socio
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Socio" : "Nuevo Socio Deportivo"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nombre completo</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>DNI</Label>
                    <Input value={formData.dni} onChange={(e) => setFormData({ ...formData, dni: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fecha de nacimiento</Label>
                    <Input type="date" value={formData.birthDate} onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                   <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                   {categories?.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                    </Select>
                    </div>
                  <div className="space-y-1.5">
                      <Label>Tipo de cuota</Label>
                       <Select 
                        value={formData.quotaType} 
                         onValueChange={(v) => setFormData({ ...formData, quotaType: v as "deportivo" | "hermanos" | "individual" })}
                          >
                           <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                            <SelectItem value="deportivo">Deportivo</SelectItem>
                            <SelectItem value="hermanos">Hermanos</SelectItem>
                             <SelectItem value="individual">Individual</SelectItem>
                            </SelectContent>
                           </Select>
                            </div>
                  <div className="space-y-1.5">
                    <Label>Telefono</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Direccion</Label>
                    <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Tutor/Responsable</Label>
                    <Select value={formData.guardianId ? String(formData.guardianId) : "null"} onValueChange={(v) => setFormData({ ...formData, guardianId: v === "null" ? null : Number(v) })}
>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">Sin tutor</SelectItem>
                        {guardianList?.guardians.map((g) => (
                          <SelectItem key={g.id} value={String(g.id)}>{g.name} ({g.dni})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Observaciones</Label>
                    <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button className="bg-[#ffc107] text-[#1a237e] hover:bg-[#e6af06]" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingId ? "Guardar Cambios" : "Crear Socio"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-gray-200">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar por nombre..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories?.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v as "" | "active" | "inactive"); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Nombre</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">DNI</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Cat.</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Tipo Cuota</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Tel.</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Estado Cuota</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td colSpan={6} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    </tr>
                  ))
                )}
                {data?.players.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 text-gray-500 font-mono">{p.dni}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">{p.category}</Badge>
                    </td>
                    <td className="py-3 px-4">
                    <Badge variant="outline" className="text-xs capitalize">
                    {p.quotaType ?? "Deportivo"}
                    </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{p.phone ?? "-"}</td>
                    <td className="py-3 px-4">
                      {p.latestQuotaStatus ? (
                        <Badge variant="outline" className={`text-xs capitalize ${statusColors[p.latestQuotaStatus] ?? ""}`}>
                          {p.latestQuotaStatus === "paid" ? "Al dia" : p.latestQuotaStatus === "pending" ? "Pendiente" : "Deudor"}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => { setViewingId(p.id); setViewDialogOpen(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600" onClick={() => handleEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {p.phone && (
                          <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600">
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => { if (confirm("Dar de baja este socio?")) deleteMutation.mutate({ id: p.id }); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && data?.players.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No se encontraron socios</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Mostrando {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} de {data.total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Socio</DialogTitle>
          </DialogHeader>
          {viewPlayer && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Nombre:</span> <span className="font-medium">{viewPlayer.name}</span></div>
                <div><span className="text-gray-500">DNI:</span> <span className="font-mono">{viewPlayer.dni}</span></div>
                <div><span className="text-gray-500">Categoria:</span> <span>{viewPlayer.category}</span></div>
                <div><span className="text-gray-500">Tipo Cuota:</span> <span className="capitalize">{viewPlayer.quotaType ?? "Deportivo"}</span></div>
                <div><span className="text-gray-500">Estado:</span> <span className="capitalize">{viewPlayer.status}</span></div>
                <div><span className="text-gray-500">Telefono:</span> <span>{viewPlayer.phone ?? "-"}</span></div>
                <div><span className="text-gray-500">Email:</span> <span>{viewPlayer.email ?? "-"}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Direccion:</span> <span>{viewPlayer.address ?? "-"}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Tutor:</span> <span>{viewPlayer.guardian?.name ?? "-"}</span></div>
              </div>
              {viewPlayer.quotas.length > 0 && (
                <div className="pt-2">
                  <h4 className="font-semibold text-sm mb-2">Historial de Cuotas</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {viewPlayer.quotas.map((q) => (
                      <div key={q.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs">
                        <span>{q.month}/{q.year}</span>
                        <Badge variant="outline" className={`text-xs capitalize ${statusColors[q.status] ?? ""}`}>
                          {q.status === "paid" ? "Pagada" : q.status === "pending" ? "Pendiente" : "Vencida"}
                        </Badge>
                        <span className="font-mono">{formatMoney(q.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
