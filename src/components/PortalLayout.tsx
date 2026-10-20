import { Outlet, Link } from "react-router";
import { Shield, ArrowLeft } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { shade } from "@/lib/color";

/**
 * Layout del portal de socios.
 *
 * Acá se define la identidad del club: el fondo y los acentos toman los colores
 * guardados en Configuración mediante variables CSS, así que todo el portal
 * (login, dashboard, botones) se pinta de la marca sin tocar cada página.
 */
export default function PortalLayout() {
  const branding = useBranding("Portal de socios");

  const cssVars = {
    "--club-primary": branding.primaryColor,
    "--club-primary-dark": shade(branding.primaryColor, -0.45),
    "--club-primary-light": shade(branding.primaryColor, 0.35),
    "--club-accent": branding.accentColor,
    "--club-accent-light": shade(branding.accentColor, 0.25),
    "--club-accent-dark": shade(branding.accentColor, -0.3),
    "--club-accent-contrast": shade(branding.accentColor, -0.75),
    "--club-accent-glow": `${branding.accentColor}80`,
    "--club-accent-soft": `${branding.accentColor}2e`,
  } as React.CSSProperties;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        ...cssVars,
        background: `radial-gradient(1200px 500px at 85% -10%, color-mix(in srgb, var(--club-accent) 16%, transparent), transparent 55%),
          radial-gradient(900px 420px at -10% 110%, color-mix(in srgb, var(--club-primary-light) 20%, transparent), transparent 55%),
          linear-gradient(160deg, var(--club-primary) 0%, var(--club-primary-dark) 100%)`,
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-white/[0.04] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.clubName}
                className="h-9 w-9 rounded-lg bg-white/10 object-contain p-1"
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: `linear-gradient(135deg, var(--club-accent-light), var(--club-accent))`,
                  boxShadow: `0 4px 12px -2px var(--club-accent-glow)`,
                }}
              >
                <Shield className="h-5 w-5" strokeWidth={2.4} style={{ color: "var(--club-accent-contrast)" }} />
              </div>
            )}
            <span className="font-bold tracking-tight">{branding.clubName}</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Panel</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 animate-fade-in">
        <Outlet />
      </div>

      <footer className="border-t border-white/[0.06] py-4 text-center text-xs text-white/35">
        Portal de socios · {branding.clubName}
      </footer>
    </div>
  );
}
