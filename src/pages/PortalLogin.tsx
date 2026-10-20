import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, LogIn, Shield } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Ingreso al portal de socios.
 *
 * Tres pasos:
 *
 *  1. **DNI** — el sistema dice si la cuenta existe y si ya tiene PIN.
 *  2. **PIN** — si ya está activada, se ingresa directo.
 *  3. **Activación** — la primera vez se pide la fecha de nacimiento del socio
 *     como prueba de identidad y recién ahí se elige el PIN.
 *
 * Ese paso 3 es la corrección de seguridad más importante del portal: antes
 * cualquiera podía fijar el PIN de cualquier DNI sin verificar nada, así que
 * con un DNI ajeno se entraba a la cuenta de esa familia.
 *
 * La sesión queda en una cookie httpOnly que emite el servidor. Ya no se guarda
 * ningún id de socio en `localStorage`.
 */
export default function PortalLogin() {
  const [step, setStep] = useState<"dni" | "pin" | "activate">("dni");
  const [dni, setDni] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const lookup = trpc.portal.lookup.useMutation({
    onSuccess: (result) => {
      if (!result.found) {
        toast.error("No encontramos ningún socio con ese DNI. Consultá en secretaría.");
        return;
      }
      setStep(result.needsActivation ? "activate" : "pin");
    },
    onError: (error) => toast.error(error.message),
  });

  const login = trpc.portal.login.useMutation({
    onSuccess: async (result) => {
      await utils.portal.invalidate();
      toast.success(`¡Hola, ${result.name}!`);
      navigate("/portal/dashboard");
    },
    onError: (error) => {
      toast.error(error.message);
      setPin("");
    },
  });

  const activate = trpc.portal.activate.useMutation({
    onSuccess: () => {
      toast.success("Acceso activado. Ingresá con tu PIN.");
      setStep("pin");
      setPin("");
      setConfirmPin("");
    },
    onError: (error) => toast.error(error.message),
  });

  const onlyDigits = (value: string) => value.replace(/\D/g, "");

  const handleActivate = () => {
    if (pin !== confirmPin) {
      toast.error("Los PIN no coinciden");
      return;
    }
    activate.mutate({ dni, birthDate, pin });
  };

  return (
    <div className="flex min-h-[60vh] animate-fade-in items-center justify-center">
      <Card className="w-full max-w-sm animate-fade-in-up rounded-2xl border-white/10 bg-white/[0.06] shadow-pop backdrop-blur-md">
        <CardHeader className="pb-4 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl"
            style={{
              background: `linear-gradient(135deg, var(--club-accent-light), var(--club-accent))`,
              boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
            }}
          >
            <Shield className="h-7 w-7" strokeWidth={2.4} style={{ color: "var(--club-accent-contrast)" }} />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-white">
            Accedé al portal
          </CardTitle>
          <p className="mt-1 text-sm text-white/60">
            Ingresá con tu DNI. La primera vez te pedimos la fecha de nacimiento del socio para
            activar tu PIN; después, entrás solo con el PIN.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === "dni" && (
            <>
              <div className="space-y-2">
                <Label className="text-white/70">DNI del socio o del tutor</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Sin puntos"
                  value={dni}
                  onChange={(e) => setDni(onlyDigits(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && dni.length >= 6 && lookup.mutate({ dni })}
                  className="h-11 rounded-xl border-white/15 bg-white/[0.07] px-4 text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
                  autoFocus
                />
                <p className="text-xs text-white/50">
                  Si sos padre, madre o tutor, ingresá tu DNI: vas a ver las cuotas de todos tus
                  hijos.
                </p>
              </div>
              <Button
                className="h-11 w-full rounded-xl font-semibold transition-all hover:opacity-90"
                style={{
                  background: `linear-gradient(90deg, var(--club-accent-light), var(--club-accent))`,
                  color: "var(--club-accent-contrast)",
                  boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
                }}
                onClick={() => lookup.mutate({ dni })}
                disabled={dni.length < 6 || lookup.isPending}
              >
                {lookup.isPending ? (
                  "Buscando…"
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" /> Continuar
                  </>
                )}
              </Button>
            </>
          )}

          {step === "pin" && (
            <>
              <div className="space-y-2">
                <Label className="text-white/70">Tu PIN de 4 dígitos</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(onlyDigits(e.target.value))}
                  onKeyDown={(e) =>
                    e.key === "Enter" && pin.length === 4 && login.mutate({ dni, pin })
                  }
                  className="h-11 rounded-xl border-white/15 bg-white/[0.07] text-center text-2xl tracking-widest text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
                  autoFocus
                />
              </div>
              <Button
                className="h-11 w-full rounded-xl font-semibold transition-all hover:opacity-90"
                style={{
                  background: `linear-gradient(90deg, var(--club-accent-light), var(--club-accent))`,
                  color: "var(--club-accent-contrast)",
                  boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
                }}
                onClick={() => login.mutate({ dni, pin })}
                disabled={pin.length !== 4 || login.isPending}
              >
                {login.isPending ? (
                  "Verificando…"
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" /> Ingresar
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-white/50">
                ¿Olvidaste tu PIN? Pedí en secretaría que te lo blanqueen.
              </p>
            </>
          )}

          {step === "activate" && (
            <>
              <p className="rounded-xl border border-white/10 bg-white/10 p-3 text-sm text-white/70">
                Es tu primer ingreso. Para confirmar que sos vos, ingresá la fecha de nacimiento del
                socio y elegí un PIN.
              </p>
              <div className="space-y-2">
                <Label className="text-white/70">Fecha de nacimiento del socio</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="h-11 rounded-xl border-white/15 bg-white/[0.07] px-4 text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
                />
                <p className="text-xs text-white/50">
                  Si tenés varios hijos en el club, sirve la fecha de cualquiera de ellos.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Elegí un PIN de 4 dígitos</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(onlyDigits(e.target.value))}
                  className="h-11 rounded-xl border-white/15 bg-white/[0.07] text-center text-2xl tracking-widest text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Repetí el PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                  className="h-11 rounded-xl border-white/15 bg-white/[0.07] text-center text-2xl tracking-widest text-white placeholder:text-white/40 focus-visible:border-[var(--club-accent)] focus-visible:bg-white/10 focus-visible:ring-[var(--club-accent-glow)]"
                />
              </div>
              <Button
                className="h-11 w-full rounded-xl font-semibold transition-all hover:opacity-90"
                style={{
                  background: `linear-gradient(90deg, var(--club-accent-light), var(--club-accent))`,
                  color: "var(--club-accent-contrast)",
                  boxShadow: `0 4px 16px -4px var(--club-accent-glow)`,
                }}
                onClick={handleActivate}
                disabled={
                  pin.length !== 4 || confirmPin.length !== 4 || !birthDate || activate.isPending
                }
              >
                {activate.isPending ? "Activando…" : "Activar acceso"}
              </Button>
            </>
          )}

          {step !== "dni" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setStep("dni");
                setPin("");
                setConfirmPin("");
                setBirthDate("");
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Cambiar DNI
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
