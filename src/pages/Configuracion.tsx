import { useRef, useState } from "react";
import { toast } from "sonner";
import { Banknote, ImagePlus, KeyRound, Palette, Save, Settings2, Trash2 } from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui-kit";
import { useAuth } from "@/hooks/useAuth";
import { isValidHex, shade } from "@/lib/color";

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
    <div className="space-y-4 animate-fade-in lg:space-y-6">
      <PageHeader title="Configuración" subtitle="Cuotas, mora y datos de cobro del club" />

      {/* El formulario se monta recién cuando llegan los valores guardados, y
          los toma como estado inicial. Así no hace falta sincronizarlo con un
          efecto, que provocaba renders en cascada. */}
      {settings ? (
        <SettingsForm initial={settings} isAdmin={isAdmin} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando configuración…</p>
      )}

      <PasswordCard />
    </div>
  );
}

type Settings = RouterOutputs["quota"]["getGlobalSettings"];

function SettingsForm({ initial, isAdmin }: { initial: Settings; isAdmin: boolean }) {
  const [form, setForm] = useState<Settings>(initial);
  const utils = trpc.useUtils();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const save = trpc.quota.updateGlobalSettings.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      utils.quota.invalidate();
      utils.portal.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  /**
   * El logo se redimensiona en el navegador antes de guardarlo: se apunta a un
   * cuadrado de 512 px y sale como WebP (o PNG si es SVG, que se manda tal
   * cual). Así pesa poco sin depender de un bucket de archivos.
   */
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen pesa más de 5 MB. Elegí una más chica.");
      return;
    }

    try {
      if (file.type === "image/svg+xml") {
        const text = await file.text();
        setForm((f) => ({ ...f, logoUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}` }));
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("La imagen no es válida"));
        el.src = dataUrl;
      });

      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL("image/webp", 0.9);
      setForm((f) => ({ ...f, logoUrl: out }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo procesar la imagen");
    }
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" /> Cuotas y mora
            </CardTitle>
            <CardDescription>Reglas que se usan al generar las cuotas de cada mes.</CardDescription>
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
                <p className="text-xs text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
                  Se usa cuando la categoría no define uno propio.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <div>
                <p className="text-sm font-medium">Descuento por hermanos</p>
                <p className="text-xs text-muted-foreground">
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

        <Card className="rounded-xl border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" /> Identidad del club
            </CardTitle>
            <CardDescription>
              Logo, nombre y colores: es lo que ven los socios cuando entran al portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo del club" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isAdmin}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-1 h-4 w-4" />
                    {form.logoUrl ? "Cambiar logo" : "Subir logo"}
                  </Button>
                  {form.logoUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isAdmin}
                      onClick={() => setForm({ ...form, logoUrl: "" })}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Quitar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG o SVG. Se achica solo para pesar poco.
                </p>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nombre del club</Label>
              <Input
                value={form.clubName}
                onChange={(e) => setForm({ ...form, clubName: e.target.value })}
                disabled={!isAdmin}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField
                label="Color principal"
                hint="Fondos y superficie del portal"
                value={form.clubPrimaryColor}
                disabled={!isAdmin}
                onChange={(v) => setForm({ ...form, clubPrimaryColor: v })}
              />
              <ColorField
                label="Color de acento"
                hint="Botones y detalles"
                value={form.clubAccentColor}
                disabled={!isAdmin}
                onChange={(v) => setForm({ ...form, clubAccentColor: v })}
              />
            </div>

            {/* Vista previa de cómo se ve el portal con estos colores */}
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: `linear-gradient(140deg, ${form.clubPrimaryColor}, ${shade(form.clubPrimaryColor, -0.45)})`,
              }}
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg" style={{ backgroundColor: form.clubAccentColor }}>
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{form.clubName || "Tu club"}</p>
                <p className="text-xs text-white/60">Así se ve el encabezado del portal</p>
              </div>
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: form.clubAccentColor, color: shade(form.clubAccentColor, -0.75) }}
              >
                Pagar
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/70 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4" /> Datos de cobro del portal
            </CardTitle>
            <CardDescription>
              Es lo que ven los socios en el portal cuando eligen pagar por transferencia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Sólo un administrador puede modificar esta configuración.
        </p>
      )}
    </>
  );
}

function ColorField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const safe = isValidHex(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
          aria-label={label}
        />
        <Input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
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
    <Card className="rounded-xl border-border/70 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Mi contraseña
        </CardTitle>
        <CardDescription>Cambiá la clave con la que entrás al panel.</CardDescription>
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
