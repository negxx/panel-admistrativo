import { useState } from "react";
import { toast } from "sonner";
import { Banknote, KeyRound, Save, Settings2 } from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/hooks/useAuth";

/**
 * Configuración del club.
 *
 * Junta en un solo lugar cosas que antes estaban desperdigadas o directamente
 * escritas en el código:
 *
 *  - Intereses por mora y día de vencimiento (estaban en una pestaña de Cuotas).
 *  - **Datos bancarios del portal**: el CBU y el alias estaban hardcodeados
 *    dentro de `PortalDashboard.tsx`. Para cambiarlos había que tocar el código.
 *  - Nombre del club, que se usa en los mensajes de WhatsApp.
 */
export default function Configuracion() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: settings } = trpc.quota.getGlobalSettings.useQuery();

  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" subtitle="Cuotas, mora y datos de cobro del club" />

      {/* El formulario se monta recién cuando llegan los valores guardados, y
          los toma como estado inicial. Así no hace falta sincronizarlo con un
          efecto, que provocaba renders en cascada. */}
      {settings ? (
        <SettingsForm initial={settings} isAdmin={isAdmin} />
      ) : (
        <p className="py-8 text-center text-sm text-gray-500">Cargando configuración…</p>
      )}

      <PasswordCard />
    </div>
  );
}

type Settings = RouterOutputs["quota"]["getGlobalSettings"];

function SettingsForm({ initial, isAdmin }: { initial: Settings; isAdmin: boolean }) {
  const [form, setForm] = useState<Settings>(initial);
  const utils = trpc.useUtils();

  const save = trpc.quota.updateGlobalSettings.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      utils.quota.invalidate();
      utils.portal.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" /> Cuotas y mora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Interés diario (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.interestRate}
                  onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-gray-400">
                  Se aplica sobre el monto neto, por cada día de atraso.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Días de gracia</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.graceDays}
                  onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-gray-400">
                  Tolerancia antes de marcar la cuota como vencida.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Día de vencimiento</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={form.dueDay}
                  onChange={(e) => setForm({ ...form, dueDay: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descuento hermanos (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
                  disabled={!isAdmin || !form.discountEnabled}
                />
                <p className="text-xs text-gray-400">
                  Se usa cuando la categoría no define uno propio.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium">Descuento por hermanos</p>
                <p className="text-xs text-gray-500">
                  Sólo se aplica a familias con 2 o más socios activos.
                </p>
              </div>
              <Switch
                checked={form.discountEnabled}
                onCheckedChange={(v) => setForm({ ...form, discountEnabled: v })}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4" /> Datos de cobro del portal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              Es lo que ven los socios en el portal cuando eligen pagar por transferencia.
            </p>
            <div className="space-y-1.5">
              <Label>Nombre del club</Label>
              <Input
                value={form.clubName}
                onChange={(e) => setForm({ ...form, clubName: e.target.value })}
                disabled={!isAdmin}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <Input
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Titular de la cuenta</Label>
                <Input
                  value={form.bankHolder}
                  onChange={(e) => setForm({ ...form, bankHolder: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>CBU / CVU</Label>
              <Input
                value={form.bankCbu}
                onChange={(e) => setForm({ ...form, bankCbu: e.target.value })}
                disabled={!isAdmin}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Alias</Label>
              <Input
                value={form.bankAlias}
                onChange={(e) => setForm({ ...form, bankAlias: e.target.value })}
                disabled={!isAdmin}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          <Save className="mr-1 h-4 w-4" />
          {save.isPending ? "Guardando…" : "Guardar configuración"}
        </Button>
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
          Sólo un administrador puede modificar esta configuración.
        </p>
      )}
    </>
  );
}

function PasswordCard() {
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Contraseña actualizada");
      setPasswords({ current: "", next: "", confirm: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = () => {
    if (passwords.next !== passwords.confirm) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }
    changePassword.mutate({ currentPassword: passwords.current, newPassword: passwords.next });
  };

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Mi contraseña
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Contraseña actual</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={passwords.current}
            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nueva contraseña</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={passwords.next}
            onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Repetir nueva</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <Button
            variant="outline"
            onClick={submit}
            disabled={!passwords.current || passwords.next.length < 6 || changePassword.isPending}
          >
            Cambiar contraseña
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
