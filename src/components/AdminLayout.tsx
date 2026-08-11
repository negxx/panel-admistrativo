import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  Inbox,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Shield,
  Tag,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Estructura del panel.
 *
 * Novedades:
 *  - El menú se filtra por rol: a la secretaría ya no se le muestran pantallas
 *    que el backend le va a rechazar igual.
 *  - "Pagos a confirmar" lleva un contador en vivo con los pagos que informaron
 *    los socios desde el portal.
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

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Panel", icon: LayoutDashboard },
  { path: "/socios", label: "Socios", icon: Users },
  { path: "/familias", label: "Familias", icon: UserCircle },
  { path: "/cuotas", label: "Cuotas y pagos", icon: Receipt },
  { path: "/pagos-pendientes", label: "Pagos a confirmar", icon: Inbox, badge: "pendingPayments" },
  { path: "/deudores", label: "Deudores", icon: AlertTriangle },
  { path: "/cierre-caja", label: "Cierre de caja", icon: Lock },
  { path: "/ingresos-egresos", label: "Ingresos y egresos", icon: ArrowLeftRight },
  { path: "/categorias", label: "Categorías", icon: Tag },
  { path: "/usuarios", label: "Usuarios", icon: Shield, adminOnly: true },
  { path: "/configuracion", label: "Configuración", icon: Settings },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();

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
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#ffc107]" />
      </div>
    );
  }

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin");
  const currentLabel = items.find((item) => item.path === location.pathname)?.label ?? "Panel";

  const badgeValue = (item: NavItem) =>
    item.badge === "pendingPayments" && pendingPayments ? pendingPayments : 0;

  const renderNav = (collapsed: boolean, onNavigate?: () => void) =>
    items.map((item) => {
      const isActive = location.pathname === item.path;
      const Icon = item.icon;
      const count = badgeValue(item);
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
            isActive
              ? "border-l-2 border-[#ffc107] bg-[#ffc107]/15 text-[#ffc107]"
              : "text-white/70 hover:bg-white/5 hover:text-white",
          )}
        >
          <div className="relative flex-shrink-0">
            <Icon className="h-5 w-5" />
            {collapsed && count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-[#ffc107]" />
            )}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              {count > 0 && (
                <Badge className="bg-[#ffc107] px-1.5 text-xs text-[#0d1642] hover:bg-[#ffc107]">
                  {count}
                </Badge>
              )}
            </>
          )}
        </Link>
      );
    });

  return (
    <div className="flex h-screen bg-[#f8f9fa]">
      {/* Barra lateral de escritorio */}
      <aside
        className={cn(
          "hidden flex-col bg-[#0d1642] text-white transition-all duration-300 lg:flex",
          sidebarOpen ? "w-64" : "w-[72px]",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ffc107]">
            <Shield className="h-5 w-5 text-[#0d1642]" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold leading-tight">Club</p>
              <p className="text-[10px] text-white/60">Sistema de gestión</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {renderNav(!sidebarOpen)}
        </nav>

        <div className="border-t border-white/10 p-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-white/70 hover:bg-white/5 hover:text-white"
          >
            <Menu className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Contraer</span>}
          </button>
        </div>
      </aside>

      {/* Menú móvil */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-[#0d1642] text-white transition-transform lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc107]">
              <Shield className="h-5 w-5 text-[#0d1642]" />
            </div>
            <p className="text-sm font-bold">Club</p>
          </div>
          <button onClick={() => setMobileMenuOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 overflow-y-auto px-2 py-4">
          {renderNav(false, () => setMobileMenuOpen(false))}
        </nav>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded p-1.5 hover:bg-gray-100 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-[#1a1a2e]">{currentLabel}</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/portal"
              className="hidden items-center gap-2 rounded-lg bg-[#ffc107]/10 px-3 py-1.5 text-sm text-[#1a237e] transition-colors hover:bg-[#ffc107]/20 sm:flex"
            >
              <Users className="h-4 w-4" />
              <span>Portal de socios</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="hidden text-right md:block">
                <p className="text-sm leading-tight text-gray-700">{user.name}</p>
                <p className="text-[11px] leading-tight text-gray-400">
                  {user.role === "admin" ? "Administrador" : "Secretaría"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} className="text-gray-600">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
