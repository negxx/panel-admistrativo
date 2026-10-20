import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Shield,
  Search,
  Tag,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Estructura del panel.
 *
 *  - El menú se filtra por rol: a la secretaría ya no se le muestran pantallas
 *    que el backend le va a rechazar igual.
 *  - "Pagos a confirmar" lleva un contador en vivo con los pagos que informaron
 *    los socios desde el portal.
 *  - Los ítems se agrupan por área para que el menú sea escaneable de un golpe.
 */

type NavItem = {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Si está en `true`, sólo lo ve un administrador. */
  adminOnly?: boolean;
  /** Clave del contador a mostrar al lado. */
  badge?: "pendingPayments";
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Gestión",
    items: [
      { path: "/", label: "Panel", icon: LayoutDashboard },
      { path: "/socios", label: "Socios", icon: Users },
      { path: "/familias", label: "Familias", icon: UserCircle },
      { path: "/cuotas", label: "Cuotas y pagos", icon: Receipt },
      { path: "/pagos-pendientes", label: "Pagos a confirmar", icon: Inbox, badge: "pendingPayments" },
      { path: "/deudores", label: "Deudores", icon: AlertTriangle },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { path: "/cierre-caja", label: "Cierre de caja", icon: Lock },
      { path: "/ingresos-egresos", label: "Ingresos y egresos", icon: ArrowLeftRight },
      { path: "/categorias", label: "Categorías", icon: Tag },
    ],
  },
  {
    label: "Sistema",
    items: [
      { path: "/usuarios", label: "Usuarios", icon: Shield, adminOnly: true },
      { path: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

/** Iniciales para el avatar: hasta dos palabras, una letra cada una. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

function SidebarBrand({ collapsed, clubName, logoUrl }: { collapsed?: boolean; clubName: string; logoUrl: string }) {
  return (
    <div className="flex items-center gap-3 px-4">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={clubName}
          className="h-10 w-10 flex-shrink-0 rounded-xl bg-white/10 object-contain p-1"
        />
      ) : (
        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_4px_12px_-2px_rgba(255,193,7,0.5)]">
          <Shield className="h-5 w-5 text-[#0d1642]" strokeWidth={2.4} />
        </div>
      )}
      {!collapsed && (
        <div className="overflow-hidden">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-white">
            {clubName}
          </p>
          <p className="truncate text-[11px] leading-tight text-white/50">Panel de gestión</p>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const branding = useBranding("Panel Administrativo");

  // Contador de pagos del portal esperando confirmación. Se refresca solo cada
  // minuto para que la secretaría vea los avisos nuevos sin recargar.
  const { data: pendingPayments } = trpc.payment.pendingReviewCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login", { replace: true });
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!user) return null;

  const roleLabel = user.role === "admin" ? "Administrador" : "Secretaría";
  const badgeValue = (item: NavItem) =>
    item.badge === "pendingPayments" && pendingPayments ? pendingPayments : 0;

  const renderSections = (collapsed: boolean, onNavigate?: () => void) =>
    NAV_SECTIONS.map(({ label, items }) => {
      const visible = items.filter((item) => !item.adminOnly || user.role === "admin");
      if (visible.length === 0) return null;
      return (
        <div key={label} className={collapsed ? "px-2" : "px-2"}>
          {!collapsed && (
            <p className="px-2 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 first:pt-1">
              {label}
            </p>
          )}
          {collapsed && <div className="mx-auto my-2 h-px w-6 bg-white/10" />}
          <nav className={collapsed ? "space-y-1" : "space-y-0.5"}>
            {visible.map((item) => {
              const isActive =
                item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
              const Icon = item.icon;
              const count = badgeValue(item);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg text-sm transition-colors duration-150",
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                    isActive
                      ? "bg-white/[0.09] font-medium text-white"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-amber-400" />
                  )}
                  <div className="relative flex-shrink-0">
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] transition-colors",
                        isActive ? "text-amber-400" : "text-current",
                      )}
                    />
                    {collapsed && count > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-[#0d1642]">
                        {count > 9 ? "9+" : count}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <Badge className="h-5 min-w-5 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-[#0d1642] hover:bg-amber-400">
                          {count}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      );
    });

  const renderUserCard = (onLogout?: () => void) => (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-xs font-bold text-[#0d1642]">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-white">{user.name}</p>
        <p className="truncate text-[11px] leading-tight text-white/50">{roleLabel}</p>
      </div>
      <button
        onClick={onLogout ?? logout}
        title="Cerrar sesión"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Barra lateral de escritorio */}
      <aside
        className={cn(
          "sidebar-surface hidden flex-col text-white transition-[width] duration-300 ease-in-out lg:flex",
          sidebarOpen ? "w-64" : "w-[76px]",
        )}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-white/[0.08] pr-2">
          <SidebarBrand collapsed={!sidebarOpen} clubName={branding.clubName} logoUrl={branding.logoUrl} />
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              title="Contraer menú"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3">{renderSections(!sidebarOpen)}</div>

        <div className="border-t border-white/[0.08] p-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="Expandir menú"
              className="mb-2 flex w-full items-center justify-center rounded-lg py-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}
          {renderUserCard()}
        </div>
      </aside>

      {/* Menú móvil */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={cn(
          "sidebar-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col text-white shadow-pop transition-transform duration-300 ease-in-out lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-white/[0.08] pr-3">
          <SidebarBrand clubName={branding.clubName} logoUrl={branding.logoUrl} />
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{renderSections(false, () => setMobileMenuOpen(false))}</div>
        <div className="border-t border-white/[0.08] p-3">{renderUserCard()}</div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b bg-card/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {NAV_SECTIONS.flatMap((s) => s.items).find((item) => item.path === location.pathname)
                ?.label ?? "Panel"}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Navegación rápida con Ctrl+K */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground md:flex"
              title="Buscar (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Buscar…</span>
              <kbd className="pointer-events-none rounded border border-border bg-card px-1 font-sans text-[10px] font-semibold text-muted-foreground">
                Ctrl K
              </kbd>
            </button>
            <ThemeToggle />

            {/* Menú de cuenta: siempre accesible, también en mobile. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#101b4d] to-[#233a8f] text-xs font-bold text-amber-300">
                    {initials(user.name)}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{roleLabel}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* La key reinicia la animación en cada cambio de pantalla. */}
          <div key={location.pathname} className="mx-auto w-full max-w-[1440px] animate-fade-in p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
