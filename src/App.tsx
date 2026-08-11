import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import AdminLayout from "./components/AdminLayout";
import PortalLayout from "./components/PortalLayout";

// Panel administrativo
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Socios = lazy(() => import("./pages/Socios"));
const Familias = lazy(() => import("./pages/Familias"));
const Cuotas = lazy(() => import("./pages/Cuotas"));
const PagosPendientes = lazy(() => import("./pages/PagosPendientes"));
const Deudores = lazy(() => import("./pages/Deudores"));
const CierreCaja = lazy(() => import("./pages/CierreCaja"));
const IngresosEgresos = lazy(() => import("./pages/IngresosEgresos"));
const Categorias = lazy(() => import("./pages/Categorias"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Configuracion = lazy(() => import("./pages/Configuracion"));

// Portal público de socios
const PortalLogin = lazy(() => import("./pages/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));

// Otros
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#ffc107]" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Panel administrativo (requiere sesión de staff) */}
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="socios" element={<Socios />} />
            <Route path="familias" element={<Familias />} />
            <Route path="cuotas" element={<Cuotas />} />
            <Route path="pagos-pendientes" element={<PagosPendientes />} />
            <Route path="deudores" element={<Deudores />} />
            <Route path="cierre-caja" element={<CierreCaja />} />
            <Route path="ingresos-egresos" element={<IngresosEgresos />} />
            <Route path="categorias" element={<Categorias />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          {/* Portal público de socios */}
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<PortalLogin />} />
            <Route path="dashboard" element={<PortalDashboard />} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
