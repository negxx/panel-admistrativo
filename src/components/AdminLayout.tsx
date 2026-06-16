import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Outlet, Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Users,
  Receipt,
  UserCircle,
  ArrowLeftRight,
  AlertTriangle,
  Menu,
  X,
  Shield,
  LogOut,
  Lock,
  Tag,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/socios", label: "Socios Deportivos", icon: Users },
  { path: "/cuotas", label: "Cuotas y Pagos", icon: Receipt },
  { path: "/familias", label: "Familias", icon: UserCircle },
  { path: "/ingresos-egresos", label: "Ingresos y Egresos", icon: ArrowLeftRight },
  { path: "/deudores", label: "Deudores y Alertas", icon: AlertTriangle },
  { path: "/usuarios", label: "Usuarios", icon: Shield },
  { path: "/cierre-caja", label: "Cierre de Caja", icon: Lock },
  { path: "/categorias", label: "Categorias", icon: Tag },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, logout, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc107]" />
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-[#f8f9fa]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[#0d1642] text-white transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-[72px]"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
          <div className="w-8 h-8 rounded-full bg-[#ffc107] flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-[#0d1642]" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight">Club Atletico</p>
              <p className="text-[10px] text-white/60">Sistema de Gestion</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-[#ffc107]/15 text-[#ffc107] border-l-2 border-[#ffc107]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-2 border-t border-white/10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/5 hover:text-white w-full"
          >
            <Menu className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Contraer</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed lg:hidden inset-y-0 left-0 z-50 w-64 bg-[#0d1642] text-white transform transition-transform ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ffc107] flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#0d1642]" />
            </div>
            <div>
              <p className="font-bold text-sm">Club Atletico</p>
              <p className="text-[10px] text-white/60">Sistema de Gestion</p>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="py-4 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-[#ffc107]/15 text-[#ffc107] border-l-2 border-[#ffc107]"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 hover:bg-gray-100 rounded"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#1a1a2e]">
                {navItems.find((n) => n.path === location.pathname)?.label ?? "Panel"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/portal"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm bg-[#ffc107]/10 text-[#1a237e] rounded-lg hover:bg-[#ffc107]/20 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Portal de Pagos</span>
            </Link>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 hidden md:block">{user.name}</span>
                <Button variant="ghost" size="sm" onClick={logout} className="text-gray-600">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Link to="/login" className="text-sm text-[#1a237e] hover:underline">
                Iniciar sesion
              </Link>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
