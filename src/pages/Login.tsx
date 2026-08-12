import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { Users, Shield, ArrowRight } from "lucide-react";

const KIMI_AUTH_URL = import.meta.env.VITE_KIMI_AUTH_URL;
const KIMI_APP_ID = import.meta.env.VITE_APP_ID;

/**
 * El login con Kimi es opcional. Si el despliegue no lo configuró, el botón ni
 * se muestra: antes aparecía igual y llevaba a una URL rota
 * (`undefined/api/oauth/authorize`).
 */
const kimiEnabled = Boolean(KIMI_AUTH_URL && KIMI_APP_ID);

function getOAuthUrl() {
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const url = new URL(`${KIMI_AUTH_URL}/api/oauth/authorize`);
  url.searchParams.set("client_id", KIMI_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", btoa(redirectUri));
  return url.toString();
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.loginLocal.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="w-full max-w-md space-y-4">
        
        {/* Login Admin */}
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#0d1642] flex items-center justify-center mb-2">
              <Shield className="w-6 h-6 text-[#ffc107]" />
            </div>
            <CardTitle className="text-xl">Acceso Administrativo</CardTitle>
            <p className="text-sm text-gray-500">Panel de gestión del club</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>

            {kimiEnabled && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">
                      O continuar con
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => {
                    window.location.href = getOAuthUrl();
                  }}
                >
                  Ingresar con Kimi
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Portal de Pagos - Destacado */}
        <a 
          href="/portal" 
          className="block group"
        >
          <Card className="border-[#ffc107] bg-[#ffc107]/5 hover:bg-[#ffc107]/10 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#ffc107] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-[#0d1642]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#0d1642]">¿Sos socio del club?</h3>
                  <p className="text-sm text-gray-600">Accedé al portal de pagos para ver tus cuotas y pagar online</p>
                </div>
                <ArrowRight className="w-5 h-5 text-[#0d1642] group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </a>

      </div>
    </div>
  );
}