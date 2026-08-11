import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Hourglass,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyStat, PageHeader, PaymentStatusBadge, StatCard } from "@/components/ui-kit";
import { formatDate, formatMoney } from "@/lib/format";
import { MONTH_NAMES } from "@contracts/constants";

const CATEGORY_COLORS = [
  "#1a237e",
  "#ffc107",
  "#00897b",
  "#e53935",
  "#8e24aa",
  "#43a047",
  "#fb8c00",
  "#3949ab",
];

/**
 * Tablero principal.
 *
 * Cambios respecto de la versión anterior:
 *  - "Deudores" ahora muestra un número real: antes contaba cuotas vencidas del
 *    mes en curso, y como nada las marcaba como vencidas, siempre daba 0.
 *  - Se agregó el aviso de pagos del portal esperando confirmación, que es la
 *    tarea más urgente del día para la secretaría.
 *  - La deuda es la acumulada de todos los períodos, no la del mes.
 */
export default function Dashboard() {
  const { data: summary, isLoading } = trpc.dashboard.getSummary.useQuery();
  const { data: trend } = trpc.dashboard.getCollectionTrend.useQuery();
  const { data: distribution } = trpc.dashboard.getCategoryDistribution.useQuery();
  const { data: recentPayments } = trpc.dashboard.getRecentPayments.useQuery();
  const { data: upcoming } = trpc.dashboard.getUpcomingDues.useQuery();

  const trendData = (trend ?? []).map((row) => ({
    mes: MONTH_NAMES[Number(row.month.slice(5)) - 1]?.slice(0, 3) ?? row.month,
    Esperado: row.expected,
    Cobrado: row.collected,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Panel general" subtitle="Cómo viene el mes del club" />

      {(summary?.pendingReviewCount ?? 0) > 0 && (
        <Link
          to="/pagos-pendientes"
          className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <div className="flex items-center gap-3">
            <Hourglass className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">
                {summary?.pendingReviewCount} pago(s) esperando confirmación
              </p>
              <p className="text-sm text-amber-800">
                Socios informaron transferencias desde el portal. Revisalas para que las cuotas
                queden saldadas.
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-amber-600" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Socios activos"
          value={isLoading ? "…" : (summary?.totalPlayers ?? 0)}
          icon={<Users className="h-5 w-5" />}
        />
        <MoneyStat
          label="Cobrado este mes"
          amount={summary?.totalCollected ?? 0}
          tone="positive"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MoneyStat
          label="Deuda acumulada"
          amount={summary?.totalDebt ?? 0}
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" />}
          hint={`${summary?.totalDebtors ?? 0} socio(s) con cuotas vencidas`}
        />
        <MoneyStat
          label="Balance del mes"
          amount={summary?.monthlyBalance ?? 0}
          tone={(summary?.monthlyBalance ?? 0) >= 0 ? "positive" : "danger"}
          icon={<Wallet className="h-5 w-5" />}
          hint={`Egresos: ${formatMoney(summary?.monthlyExpense ?? 0)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border border-gray-200 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cobranza del año</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Legend />
                <Bar dataKey="Esperado" fill="#c5cae9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cobrado" fill="#1a237e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Socios por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {(distribution ?? []).length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">Sin datos todavía</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="count"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {(distribution ?? []).map((_, index) => (
                      <Cell key={index} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimos pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(recentPayments ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">Todavía no hay pagos.</p>
            )}
            {(recentPayments ?? []).map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{payment.payerName}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(payment.paymentDate)}
                    {payment.source === "portal" && " · desde el portal"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <PaymentStatusBadge status={payment.status} />
                  <span className="font-mono font-semibold text-green-600">
                    {formatMoney(payment.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Vencen esta semana
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(upcoming ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                No hay cuotas por vencer en los próximos 7 días.
              </p>
            )}
            {(upcoming ?? []).map((quota) => (
              <div
                key={quota.id}
                className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{quota.playerName}</p>
                  <p className="text-xs text-gray-400">
                    Vence {formatDate(quota.dueDate)}
                    {quota.contactPhone ? ` · ${quota.contactPhone}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge variant="outline" className="border-orange-200 text-orange-600">
                    Pendiente
                  </Badge>
                  <span className="font-mono font-semibold">
                    {formatMoney(quota.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
