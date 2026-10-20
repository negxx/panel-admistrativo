import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { ArrowRight, Loader2, Shield, Users, Wallet, CalendarCheck } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";

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

const BRAND_FEATURES = [
  {
    icon: Users,
    title: "Socios y familias",
    text: "Fichas, cuotas y deuda de cada chico, todo en un solo lugar.",
  },
  {
    icon: CalendarCheck,
    title: "Cobros sin papel",
    text: "Las familias avisan sus pagos desde el portal y vos los confirmás.",
  },
  {
    icon: Wallet,
    title: "Caja bajo control",
    text: "Cierre diario, ingresos y egresos con el arqueo siempre cuadrado.",
  },
] as const;

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tardando, setTardando] = useState(false);
  const branding = useBranding("Acceso");

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.loginLocal.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => setError(err.message),
  });

  const loading = loginMutation.isPending;

  /**
   * En el plan gratuito, la primera entrada del día despierta el servidor y la
   * base: puede tardar varios segundos. Sin este aviso parece que se colgó.
   */
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTardando(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setTardando(false);
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Panel de marca — sólo en pantallas anchas */}
      <aside className="brand-surface relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="dots-pattern absolute inset-0 opacity-60" aria-hidden />

        <div className="relative flex items-center gap-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.clubName}
              className="h-11 w-11 rounded-xl bg-white/10 object-contain p-1.5"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_4px_16px_-2px_rgba(255,193,7,0.55)]">
              <Shield className="h-6 w-6 text-[#0d1642]" strokeWidth={2.4} />
            </div>
          )}
          <div>
            <p className="text-lg font-bold tracking-tight text-white">{branding.clubName}</p>
            <p className="text-xs text-white/60">Sistema de gestión</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-3xl font-bold leading-snug tracking-tight text-white">
            Toda la secretaría <span className="brand-text">en una pantalla</span>
          </h1>
          <div className="mt-8 space-y-5">
            {BRAND_FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-amber-300">
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-sm leading-relaxed text-white/60">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">Gestión diaria del club, simple y ordenada.</p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Encabezado compacto para mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.clubName}
                className="h-11 w-11 rounded-xl bg-muted object-contain p-1.5"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_4px_16px_-2px_rgba(255,193,7,0.55)]">
                <Shield className="h-6 w-6 text-[#0d1642]" strokeWidth={2.4} />
              </div>
            )}
            <div>
              <p className="text-lg font-bold tracking-tight">{branding.clubName}</p>
              <p className="text-xs text-muted-foreground">Sistema de gestión</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-card sm:p-8 animate-fade-in-up">
            <h2 className="text-xl font-bold tracking-tight">Acceso administrativo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ingresá con tu usuario de la secretaría.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                />
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {loading && tardando && !error && (
                <p className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-info">
                  <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin" />
                  Despertando el servidor… la primera entrada del día puede tardar unos segundos.
                </p>
              )}

              <Button type="submit" className="w-full gap-2" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Ingresando…
                  </>
                ) : (
                  <>
                    Ingresar <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {kimiEnabled && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">O continuar con</span>
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
          </div>

          {/* Portal de socios */}
          <a href="/portal" className="group mt-4 block">
            <div className="flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/50 hover:shadow-card-hover">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_4px_12px_-2px_rgba(255,193,7,0.5)] transition-transform duration-200 group-hover:scale-110">
                <Users className="h-5 w-5 text-[#0d1642]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold tracking-tight">¿Sos socio del club?</h3>
                <p className="text-sm text-muted-foreground">
                  Entrá al portal para ver tus cuotas y avisar tus pagos
                </p>
              </div>
              <ArrowRight className="h-5 w-5 flex-shrink-0 text-amber-600 transition-transform duration-200 group-hover:translate-x-1 dark:text-amber-400" />
            </div>
          </a>
        </div>
      </main>
    </div>
  );
}
