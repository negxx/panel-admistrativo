import { Routes, Route } from "react-router";
import { Suspense, lazy } from "react";
import { Toaster } from "sonner";
import AdminLayout from "./components/AdminLayout";
import PortalLayout from "./components/PortalLayout";
const Usuarios = lazy(() => import("./pages/Usuarios"));

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Socios = lazy(() => import("./pages/Socios"));
const Cuotas = lazy(() => import("./pages/Cuotas"));
const Familias = lazy(() => import("./pages/Familias"));
const IngresosEgresos = lazy(() => import("./pages/IngresosEgresos"));
const Deudores = lazy(() => import("./pages/Deudores"));
const PortalLogin = lazy(() => import("./pages/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CierreCaja = lazy(() => import("./pages/CierreCaja"));
const Categorias = lazy(() => import("./pages/Categorias"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc107]" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Admin Routes */}
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="socios" element={<Socios />} />
            <Route path="cuotas" element={<Cuotas />} />
            <Route path="familias" element={<Familias />} />
            <Route path="ingresos-egresos" element={<IngresosEgresos />} />
            <Route path="deudores" element={<Deudores />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="cierre-caja" element={<CierreCaja />} />
            <Route path="categorias" element={<Categorias />} />
          </Route>

          {/* Public Portal Routes */}
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<PortalLogin />} />
            <Route path="dashboard" element={<PortalDashboard />} />
          </Route>

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
