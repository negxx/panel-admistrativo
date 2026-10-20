import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Shield, Trash2, User } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyRow, LoadingRows, PageHeader } from "@/components/ui-kit";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

/**
 * Usuarios del panel.
 *
 * Las contraseñas se guardan hasheadas (scrypt) y el backend impide borrarse a
 * uno mismo o dejar al club sin ningún administrador.
 */

type UserRow = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "secretary";
  createdAt: Date | null;
};

const emptyForm = {
  username: "",
  password: "",
  name: "",
  role: "secretary" as "admin" | "secretary",
};

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const create = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuario creado");
      closeDialog();
      utils.users.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Usuario actualizado");
      closeDialog();
      utils.users.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuario eliminado");
      utils.users.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    if (editing) {
      update.mutate({
        id: editing.id,
        username: form.username,
        name: form.name,
        role: form.role,
        // Vacío significa "no cambiar la contraseña".
        password: form.password || undefined,
      });
    } else {
      create.mutate(form);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in lg:space-y-6">
      <PageHeader
        title="Usuarios del panel"
        subtitle="Quién puede entrar al sistema y con qué permisos"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nuevo usuario
          </Button>
        }
      />

      <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm text-info">
        <p className="font-semibold">Qué puede hacer cada rol</p>
        <ul className="mt-1 space-y-0.5 text-info/80">
          <li>
            <strong>Administrador:</strong> todo, incluidos usuarios, categorías, configuración y
            borrado de cierres de caja.
          </li>
          <li>
            <strong>Secretaría:</strong> el día a día — socios, familias, cobros, cuotas, caja y
            confirmación de pagos del portal.
          </li>
        </ul>
      </div>

      <Card className="rounded-xl border-border/70 py-0 shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Creado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRows colSpan={5} />}
                {!isLoading && (users ?? []).length === 0 && (
                  <EmptyRow colSpan={5} message="No hay usuarios cargados." />
                )}
                {(users ?? []).map((user) => {
                  const isMe = currentUser?.source === "local" && currentUser.id === user.id;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-border/60 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          {isMe && (
                            <Badge variant="outline" className="text-xs">
                              Vos
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{user.username}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            user.role === "admin"
                              ? "gap-1 border-warning/40 bg-warning/10 text-warning"
                              : "gap-1 border-border text-muted-foreground"
                          }
                        >
                          {user.role === "admin" ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {user.role === "admin" ? "Administrador" : "Secretaría"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(user as UserRow);
                              setForm({
                                username: user.username,
                                password: "",
                                name: user.name,
                                role: user.role,
                              });
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={isMe}
                            title={isMe ? "No podés borrar tu propio usuario" : undefined}
                            onClick={() => remove.mutate({ id: user.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre de usuario</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "Dejar vacío para no cambiarla" : "Mínimo 6 caracteres"}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="secretary">Secretaría</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                disabled={
                  !form.name ||
                  form.username.length < 3 ||
                  (!editing && form.password.length < 6) ||
                  create.isPending ||
                  update.isPending
                }
              >
                {editing ? "Guardar" : "Crear usuario"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
