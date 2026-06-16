
import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Send,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#1a237e", "#283593", "#3949ab", "#ffc107", "#ff9800", "#ff5722"];

function formatMoney(amount: number) {
  return `$ ${amount.toLocaleString("es-AR")}`;
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg,
  trend,
  trendUp,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconBg: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          {trend && (
            <Badge
              variant="outline"
              className={`text-xs ${
                trendUp ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"
              }`}
            >
              {trendUp ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
              {trend}
            </Badge>
          )}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold text-[#1a1a2e] font-mono">{value}</p>
          <p className="text-sm text-gray-500 mt-0.5">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary } = trpc.dashboard.getSummary.useQuery();
  const { data: trend } = trpc.dashboard.getCollectionTrend.useQuery();
  const { data: categories } = trpc.dashboard.getCategoryDistribution.useQuery();
  const { data: recentPayments } = trpc.dashboard.getRecentPayments.useQuery();
  const { data: upcomingDues } = trpc.dashboard.getUpcomingDues.useQuery();

  // Año dinámico
  const currentYear = new Date().getFullYear();

  // Generar nombres de meses dinámicamente para el año actual
  const monthNames: Record<string, string> = useMemo(() => {
    const months: Record<string, string> = {};
    const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    monthLabels.forEach((label, index) => {
      const monthNum = String(index + 1).padStart(2, "0");
      months[`${currentYear}-${monthNum}`] = label;
    });
    return months;
  }, [currentYear]);

  const trendData = useMemo(() => {
    if (!trend) return [];
    return trend.map((t) => ({
      ...t,
      label: monthNames[t.month] ?? t.month,
    }));
  }, [trend, monthNames]);

  const pieData = useMemo(() => {
    if (!categories) return [];
    return categories.map((c) => ({
      name: c.category,
      value: c.count,
    }));
  }, [categories]);

  // Calcular porcentaje de cobranza real
  const collectionPercentage = useMemo(() => {
    if (!summary || summary.totalCollected === 0) return 0;
    // Estimación: objetivo = totalPlayers * cuota promedio (ej: $15.000)
    const estimatedGoal = (summary.totalPlayers || 0) * 15000;
    if (estimatedGoal === 0) return 0;
    return Math.round((summary.totalCollected / estimatedGoal) * 100);
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Socios Activos"
          value={String(summary?.totalPlayers ?? 0)}
          subtitle="Jugadores registrados"
          icon={Users}
          iconBg="bg-blue-600"
          trend={`+${summary?.totalPlayers ?? 0}`}
          trendUp
        />
        <KPICard
          title="Cobrado Este Mes"
          value={formatMoney(summary?.totalCollected ?? 0)}
          subtitle={`${collectionPercentage}% del objetivo estimado`}
          icon={DollarSign}
          iconBg="bg-[#ffc107]"
          trend={`${collectionPercentage}%`}
          trendUp={collectionPercentage >= 50}
        />
        <KPICard
          title="Deudores"
          value={String(summary?.totalDebtors ?? 0)}
          subtitle="Cuotas vencidas"
          icon={AlertTriangle}
          iconBg="bg-red-500"
          trend={`${summary?.totalDebtors ?? 0}`}
          trendUp={false}
        />
        <KPICard
          title="Balance Mensual"
          value={formatMoney(summary?.monthlyBalance ?? 0)}
          subtitle={`Ingresos: ${formatMoney(summary?.monthlyIncome ?? 0)}`}
          icon={TrendingUp}
          iconBg="bg-green-500"
          trend={`${formatMoney(summary?.monthlyBalance ?? 0)}`}
          trendUp={(summary?.monthlyBalance ?? 0) >= 0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collection Trend */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Evolucion de Cuotas - {currentYear}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value)}
                    contentStyle={{ borderRadius: 8, fontSize: 13 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expected"
                    name="Esperado"
                    stroke="#1a237e"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="collected"
                    name="Cobrado"
                    stroke="#ffc107"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Socios por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-600">
                    Cat. {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Ultimos Pagos Recibidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Socio</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500">Monto</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments?.slice(0, 6).map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-2 font-medium">{p.guardianName ?? "N/A"}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-green-600">
                        {formatMoney(p.totalAmount)}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500">
                        {p.paymentDate ? new Date(p.paymentDate + "T12:00:00").toLocaleDateString("es-AR") : "-"}
                      </td>
                    </tr>
                  ))}
                  {(!recentPayments || recentPayments.length === 0) && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-gray-400">
                        No hay pagos recientes
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Dues */}
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Cuotas por Vencer (7 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Jugador</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500">Monto</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Vence</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDues?.map((q) => (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-2 font-medium">{q.playerName ?? "N/A"}</td>
                      <td className="py-2.5 px-2 text-right font-mono">{formatMoney(q.totalAmount)}</td>
                      <td className="py-2.5 px-2 text-gray-500">
                        {q.dueDate ? new Date(q.dueDate + "T12:00:00").toLocaleDateString("es-AR") : "-"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {q.guardianPhone && (
                          <a
                            href={`https://wa.me/${q.guardianPhone.replace(/\D/g, "")}?text=Hola!+Te+recordamos+que+tu+cuota+vence+pronto.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded text-xs hover:bg-green-100 transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            WhatsApp
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!upcomingDues || upcomingDues.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        No hay cuotas por vencer
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}