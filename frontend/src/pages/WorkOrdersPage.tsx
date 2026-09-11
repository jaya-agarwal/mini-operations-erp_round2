import { FormEvent, useEffect, useState } from "react";
import { Wrench, Plus } from "lucide-react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

interface WorkOrder {
  id: string;
  requiredQuantity: number;
  status: string;
  availableAtLocation: number;
  shortage: number;
  item: { name: string };
  location: { name: string };
  assignedUser: { name: string };
}
interface Ref {
  id: string;
  name: string;
}

const statusColor: Record<string, string> = {
  ASSIGNED: "bg-steel-200 text-steel-700 dark:bg-steel-700 dark:text-steel-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  COMPLETED: "bg-ok-50 text-ok-600 dark:bg-ok-500/15 dark:text-ok-500",
};

export default function WorkOrdersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [users, setUsers] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ itemId: "", locationId: "", requiredQuantity: "", assignedUserId: "" });

  async function load() {
    const [woRes, itemRes, locRes] = await Promise.all([
      api.get("/work-orders"),
      api.get("/items"),
      api.get("/locations"),
    ]);
    setOrders(woRes.data.data);
    setItems(itemRes.data.data);
    setLocations(locRes.data.data);
    // No list-users endpoint in the minimal API surface — Admin can type
    // assignedUserId directly if needed; for the demo we default to self.
    if (user) setUsers([{ id: user.id, name: `${user.name} (me)` }]);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/work-orders", {
        itemId: form.itemId,
        locationId: form.locationId,
        requiredQuantity: Number(form.requiredQuantity),
        assignedUserId: form.assignedUserId,
      });
      setForm({ itemId: "", locationId: "", requiredQuantity: "", assignedUserId: "" });
      setShowForm(false);
      await load();
      toast.push("Work order created");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function updateStatus(id: string, status: string) {
    setError(null);
    try {
      await api.patch(`/work-orders/${id}/status`, { status });
      await load();
      toast.push(`Work order moved to ${status.replace("_", " ").toLowerCase()}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wrench size={18} className="text-amber-600" />
            Work Orders
          </h1>
          <p className="text-sm text-ink-muted">Shortage is calculated automatically against live stock</p>
        </div>
        {user?.role === "ADMIN" && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} />
            {showForm ? "Cancel" : "New work order"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-danger-600 flag-row px-3 py-2 rounded">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-ink-muted">Item</label>
            <select
              className="input mt-1"
              required
              value={form.itemId}
              onChange={(e) => setForm({ ...form, itemId: e.target.value })}
            >
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Location</label>
            <select
              className="input mt-1"
              required
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            >
              <option value="">Select location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Required qty</label>
            <input
              className="input mt-1"
              type="number"
              min={1}
              required
              value={form.requiredQuantity}
              onChange={(e) => setForm({ ...form, requiredQuantity: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Assigned user</label>
            <select
              className="input mt-1"
              required
              value={form.assignedUserId}
              onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" type="submit">
            Create
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper border-b border-paper-border dark:bg-steel-800 dark:border-steel-700">
            <tr>
              <th className="table-th">Item</th>
              <th className="table-th">Location</th>
              <th className="table-th">Assigned</th>
              <th className="table-th">Required</th>
              <th className="table-th">Available</th>
              <th className="table-th">Shortage</th>
              <th className="table-th">Status</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border dark:divide-steel-700">
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-3 py-3">
                    <div className="h-3.5 rounded bg-paper-border/60 dark:bg-steel-700 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading &&
              orders.map((o) => (
                <tr key={o.id} className={o.shortage > 0 ? "flag-row" : undefined}>
                  <td className="table-td font-medium">{o.item.name}</td>
                  <td className="table-td">{o.location.name}</td>
                  <td className="table-td">{o.assignedUser.name}</td>
                  <td className="table-td table-mono">{o.requiredQuantity}</td>
                  <td className="table-td table-mono">{o.availableAtLocation}</td>
                  <td className="table-td">
                    {o.shortage > 0 ? (
                      <span className="badge bg-danger-50 text-danger-600 dark:bg-danger-500/15 table-mono">
                        {o.shortage} short
                      </span>
                    ) : (
                      <span className="badge bg-ok-50 text-ok-600 dark:bg-ok-500/15">OK</span>
                    )}
                  </td>
                  <td className="table-td">
                    <span className={`badge ${statusColor[o.status]}`}>{o.status.replace("_", " ")}</span>
                  </td>
                  <td className="table-td">
                    {o.status !== "COMPLETED" && (
                      <select
                        className="input text-xs py-1"
                        value=""
                        onChange={(e) => e.target.value && updateStatus(o.id, e.target.value)}
                      >
                        <option value="">Move to…</option>
                        {o.status === "ASSIGNED" && <option value="IN_PROGRESS">In Progress</option>}
                        {o.status === "IN_PROGRESS" && <option value="COMPLETED">Completed</option>}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td className="table-td text-ink-faint py-8 text-center" colSpan={8}>
                  No work orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
