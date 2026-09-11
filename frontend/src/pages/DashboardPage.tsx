import { useEffect, useState } from "react";
import {
  Boxes,
  AlertTriangle,
  Wrench,
  ArrowLeftRight,
  ShoppingCart,
  PackageCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Stats {
  inventory: {
    physical: number;
    reserved: number;
    damaged: number;
    available: number;
    batchCount: number;
    lowStockThreshold: number;
  };
  lowStock: { id: string; item: string; sku: string; location: string; batchCode: string; available: number }[];
  stockByCategory: { name: string; available: number }[];
  workOrders: Record<string, number>;
  transfers: Record<string, number>;
  orders: Record<string, number> & { reservedUnits: number };
  activity: {
    id: string;
    type: string;
    label: string;
    quantity: number;
    item: string;
    location: string;
    createdAt: string;
  }[];
}

const ACTIVITY_DOT: Record<string, string> = {
  RECEIPT: "bg-ok-500",
  RESERVE: "bg-teal-500",
  RELEASE_RESERVATION: "bg-steel-400",
  TRANSFER_DISPATCH: "bg-amber-500",
  TRANSFER_RECEIPT: "bg-ok-500",
  DAMAGE: "bg-danger-500",
  ADJUSTMENT: "bg-steel-400",
};

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  delay,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number;
  sub?: string;
  delay: number;
}) {
  return (
    <div
      className="card p-4 animate-stagger"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</span>
        <Icon size={16} className="text-amber-600" />
      </div>
      <div className="stat-num text-3xl mt-2">{value}</div>
      {sub && <div className="text-xs text-ink-muted mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((res) => setStats(res.data.data))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (error) {
    return <div className="text-sm text-danger-600">{error}</div>;
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 h-24 animate-pulse bg-paper-border/40" />
        ))}
      </div>
    );
  }

  const activeWorkOrders = (stats.workOrders.ASSIGNED ?? 0) + (stats.workOrders.IN_PROGRESS ?? 0);
  const inTransitTransfers =
    (stats.transfers.DISPATCHED ?? 0) + (stats.transfers.PARTIALLY_RECEIVED ?? 0) + (stats.transfers.REQUESTED ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {greeting}, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Live snapshot across every location — {stats.inventory.batchCount} active batches on the floor.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile icon={Boxes} label="Available stock" value={stats.inventory.available} sub={`${stats.inventory.physical} physical on hand`} delay={0} />
        <KpiTile icon={Wrench} label="Open work orders" value={activeWorkOrders} sub={`${stats.workOrders.COMPLETED ?? 0} completed`} delay={60} />
        <KpiTile icon={ArrowLeftRight} label="Transfers in motion" value={inTransitTransfers} sub={`${stats.transfers.RECEIVED ?? 0} fully received`} delay={120} />
        <KpiTile icon={ShoppingCart} label="Units reserved" value={stats.orders.reservedUnits} sub={`${stats.orders.RESERVED ?? 0} live reservations`} delay={180} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="panel-heading">Available stock by category</h2>
          </div>
          {stats.stockByCategory.length === 0 ? (
            <EmptyMini text="No inventory received yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.stockByCategory} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3E0D6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B6A63" }} axisLine={{ stroke: "#E3E0D6" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B6A63" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(220,154,28,0.08)" }}
                  contentStyle={{ borderRadius: 6, border: "1px solid #E3E0D6", fontSize: 12 }}
                />
                <Bar dataKey="available" radius={[4, 4, 0, 0]}>
                  {stats.stockByCategory.map((entry, i) => (
                    <Cell key={entry.name} fill={i % 2 === 0 ? "#DC9A1C" : "#2B6E71"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600" />
            <h2 className="panel-heading">Low stock — {stats.inventory.lowStockThreshold} units or fewer</h2>
          </div>
          {stats.lowStock.length === 0 ? (
            <EmptyMini text="Nothing running low right now." />
          ) : (
            <ul className="divide-y divide-paper-border dark:divide-steel-700">
              {stats.lowStock.map((b) => (
                <li key={b.id} className="flag-row -mx-1 px-3 py-2 rounded flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{b.item}</div>
                    <div className="text-xs text-ink-muted font-mono">
                      {b.location} · {b.batchCode}
                    </div>
                  </div>
                  <span className="table-mono font-semibold text-amber-700">{b.available}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <PackageCheck size={15} className="text-teal-600" />
          <h2 className="panel-heading">Live activity ledger</h2>
        </div>
        {stats.activity.length === 0 ? (
          <EmptyMini text="No inventory movement recorded yet." />
        ) : (
          <ul className="space-y-2.5">
            {stats.activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ACTIVITY_DOT[a.type] ?? "bg-steel-400"}`} />
                <span className="font-mono text-xs text-ink-faint w-16 shrink-0">{timeAgo(a.createdAt)}</span>
                <span className="text-ink flex-1">
                  {a.label} · <span className="font-medium">{a.item}</span>{" "}
                  <span className="text-ink-muted">at {a.location}</span>
                </span>
                <span className="table-mono text-ink-muted">{a.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted py-6 text-center">{text}</p>;
}
