import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus, Shield, User } from "lucide-react";

export default function Usuarios() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    role: "admin" as "admin" | "secretary",
  });

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();
  
  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setOpen(false);
      setForm({ username: "", password: "", name: "", role: "admin" });
      setLoading(false);
      setError("");
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });
  
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setOpen(false);
      setEditing(null);
      setForm({ username: "", password: "", name: "", role: "admin" });
      setLoading(false);
      setError("");
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });
  
  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => utils.users.list.invalidate(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    if (editing) {
      updateMutation.mutate(
        { ...form, id: editing.id, password: form.password || undefined },
        {
          onError: (err) => {
            setError(err.message);
            setLoading(false);
          },
        }
      );
    } else {
      createMutation.mutate(form, {
        onError: (err) => {
          setError(err.message);
          setLoading(false);
        },
      });
    }
  };

  const openEdit = (user: any) => {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      name: user.name,
      role: user.role,
    });
    setOpen(true);
  };

  if (isLoading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Usuarios</h2>
          <p className="text-gray-500">Gestión de usuarios administrativos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setError(""); setForm({ username: "", password: "", name: "", role: "admin" }); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Usuario</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Mínimo 3 caracteres</p>
              </div>
              <div>
                <Label>{editing ? "Contraseña (dejar vacío para no cambiar)" : "Contraseña"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editing}
                />
                <p className="text-xs text-gray-400 mt-1">Mínimo 4 caracteres</p>
              </div>
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Mínimo 1 carácter</p>
              </div>
              <div>
                <Label>Rol</Label>
                <Select
                  value={form.role}
                  onValueChange={(v: "admin" | "secretary") => setForm({ ...form, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="secretary">Secretario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              
              <Button type="submit" className="w-full" disabled={loading || createMutation.isPending || updateMutation.isPending}>
                {loading ? "Procesando..." : (editing ? "Guardar Cambios" : "Crear Usuario")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-lg border">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Usuario</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Rol</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.role === "admin" ? <Shield className="w-4 h-4 text-blue-500" /> : <User className="w-4 h-4 text-gray-400" />}
                    <span className="font-medium">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{user.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${user.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                    {user.role === "admin" ? "Admin" : "Secretario"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500"
                    onClick={() => { if (confirm("¿Eliminar usuario?")) deleteMutation.mutate({ id: user.id }); }}
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
  );
}