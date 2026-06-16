import { Outlet, Link } from "react-router";
import { Shield, ArrowLeft } from "lucide-react";

export default function PortalLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1642] via-[#1a237e] to-[#283593]">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white">
            <Shield className="w-6 h-6 text-[#ffc107]" />
            <span className="font-bold">Club Atletico</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Panel</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
