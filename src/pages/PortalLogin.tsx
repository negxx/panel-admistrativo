import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, LogIn, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function PortalLogin() {
  const [dni, setDni] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"dni" | "pin" | "setpin">("dni");
  const [guardianName, setGuardianName] = useState("");
  const navigate = useNavigate();

  const checkDni = trpc.portal.getGuardianByDni.useQuery(
    { dni },
    { enabled: false }
  );

  const verifyPin = trpc.portal.verifyPin.useMutation({
    onSuccess: (data) => {
      if (data.success && data.guardianId) {
        localStorage.setItem("portalGuardianId", String(data.guardianId));
        localStorage.setItem("portalIsPlayer", String(data.isPlayer ?? false));
        toast.success(`Bienvenido, ${data.name}!`);
        navigate("/portal/dashboard");
      } else {
        toast.error(data.message ?? "PIN incorrecto");
      }
    },
  });

  const setPinMutation = trpc.portal.setPin.useMutation({
    onSuccess: () => {
      toast.success("PIN configurado correctamente");
      setStep("pin");
    },
  });

  const handleCheckDni = async () => {
    if (!dni.trim()) { toast.error("Ingrese su DNI"); return; }
    try {
      const result = await checkDni.refetch();
      const guardian = result.data;
      if (!guardian) { toast.error("No se encontro un socio con ese DNI"); return; }
      setGuardianName(guardian.name);
      if (guardian.hasPin) { setStep("pin"); } else { setStep("setpin"); }
    } catch { toast.error("Error al buscar socio"); }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm border-0 shadow-2xl bg-white/95 backdrop-blur">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1a237e] to-[#283593] flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Shield className="w-7 h-7 text-[#ffc107]" />
          </div>
          <CardTitle className="text-xl text-[#1a237e]">Acceso para Socios</CardTitle>
          <p className="text-sm text-gray-500 mt-1">Consulte y pague sus cuotas</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "dni" && (
            <>
              <div className="space-y-2">
                <Label className="text-gray-700">DNI</Label>
                <Input
                  placeholder="Ingrese su DNI"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckDni()}
                  className="h-11"
                />
              </div>
              <Button
                className="w-full h-11 bg-gradient-to-r from-[#1a237e] to-[#283593] hover:from-[#283593] hover:to-[#3949ab] text-white"
                onClick={handleCheckDni}
                disabled={checkDni.isFetching}
              >
                {checkDni.isFetching ? "Buscando..." : (
                  <><LogIn className="w-4 h-4 mr-2" /> Ingresar</>
                )}
              </Button>
            </>
          )}

          {step === "pin" && (
            <>
              <p className="text-sm text-center text-gray-600">Hola, <strong>{guardianName}</strong>!</p>
              <div className="space-y-2">
                <Label className="text-gray-700">PIN de 4 digitos</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="****"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && verifyPin.mutate({ dni, pin })}
                  className="h-11 text-center text-2xl tracking-widest"
                />
              </div>
              <Button
                className="w-full h-11 bg-gradient-to-r from-[#1a237e] to-[#283593] hover:from-[#283593] hover:to-[#3949ab] text-white"
                onClick={() => verifyPin.mutate({ dni, pin })}
                disabled={pin.length !== 4 || verifyPin.isPending}
              >
                {verifyPin.isPending ? "Verificando..." : (
                  <><KeyRound className="w-4 h-4 mr-2" /> Acceder</>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-gray-500" onClick={() => { setStep("dni"); setPin(""); }}>
                Cambiar DNI
              </Button>
            </>
          )}

          {step === "setpin" && (
            <>
              <p className="text-sm text-center text-gray-600">Bienvenido, <strong>{guardianName}</strong>! Configure su PIN para acceder.</p>
              <div className="space-y-2">
                <Label className="text-gray-700">Crear PIN (4 digitos)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="****"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="h-11 text-center text-2xl tracking-widest"
                />
              </div>
              <Button
                className="w-full h-11 bg-gradient-to-r from-[#1a237e] to-[#283593] hover:from-[#283593] hover:to-[#3949ab] text-white"
                onClick={() => { if (pin.length === 4) setPinMutation.mutate({ dni, pin }); else toast.error("Ingrese 4 digitos"); }}
                disabled={pin.length !== 4 || setPinMutation.isPending}
              >
                {setPinMutation.isPending ? "Guardando..." : "Configurar PIN"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}