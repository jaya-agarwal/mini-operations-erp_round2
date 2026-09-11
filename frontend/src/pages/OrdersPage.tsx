import { FormEvent, useEffect, useState } from "react";
import { ShoppingCart, Plus } from "lucide-react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

interface Order {
  id: string;
  customerName: string;
  quantity: number;
  status: string;
  item: { name: string };
  createdAt: string;
}
interface Batch {
  id: string;
  batchCode: string;
  availableQuantity: number;
  item: { id: string; name: string };
  location: { id: string; name: string };
}
interface Ref {
  id: string;
  name: string;
}

const statusColor: Record<string, string> = {
  RESERVED: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-200",
  FULFILLED: "bg-ok-50 text-ok-600 dark:bg-ok-500/15 dark:text-ok-500",
  CANCELLED: "bg-steel-200 text-steel-600 dark:bg-steel-700 dark:text-steel-400",
};

export default function OrdersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canAct = user?.role === "ADMIN" || user?.role === "SALES";

  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", locationId: "", batchId: "", quantity: "" });

  async function load() {
    const [oRes, bRes, lRes] = await Promise.all([
      api.get("/orders"),
      api.get("/inventory"),
      api.get("/locations"),
    ]);
    setOrders(oRes.data.data);
    setBatches(bRes.data.data);
    setLocations(lRes.data.data);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const batchesAtLocation = batches.filter((b) => b.location.id === form.locationId);
  const selectedBatch = batches.find((b) => b.id === form.batchId);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedBatch) return;
    try {
      await api.post("/orders", {
        customerName: form.customerName,
        itemId: selectedBatch.item.id,
        locationId: form.locationId,
        batchId: form.batchId,
        quantity: Number(form.quantity),
      });
      setForm({ customerName: "", locationId: "", batchId: "", quantity: "" });
      setShowForm(false);
      await load();
      toast.push(`Reserved ${form.quantity} unit(s) for ${form.customerName}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleCancel(id: string, customerName: string) {
    setError(null);
    try {
      await api.post(`/orders/${id}/cancel`);
      await load();
      toast.push(`Order for ${customerName} cancelled — reservation released`, "info");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShoppingCart size={18} className="text-amber-600" />
            Customer Orders
          </h1>
          <p className="text-sm text-ink-muted">Reservations are concurrency-safe at the database level</p>
        </div>
        {canAct && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} />
            {showForm ? "Cancel" : "New order"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-danger-600 flag-row px-3 py-2 rounded">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-ink-muted">Customer name</label>
            <input
              className="input mt-1"
              required
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Location</label>
            <select
              className="input mt-1"
              required
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value, batchId: "" })}
            >
              <option value="">Select</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Item / batch</label>
            <select
              className="input mt-1"
              required
              value={form.batchId}
              onChange={(e) => setForm({ ...form, batchId: e.target.value })}
            >
              <option value="">Select</option>
              {batchesAtLocation.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.item.name} · {b.batchCode} (avail {b.availableQuantity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Quantity</label>
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={selectedBatch?.availableQuantity}
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <button className="btn-primary" type="submit">
            Reserve
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper border-b border-paper-border dark:bg-steel-800 dark:border-steel-700">
            <tr>
              <th className="table-th">Customer</th>
              <th className="table-th">Item</th>
              <th className="table-th">Qty</th>
              <th className="table-th">Status</th>
              {canAct && <th className="table-th"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border dark:divide-steel-700">
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-3 py-3">
                    <div className="h-3.5 rounded bg-paper-border/60 dark:bg-steel-700 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading &&
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="table-td font-medium">{o.customerName}</td>
                  <td className="table-td">{o.item.name}</td>
                  <td className="table-td table-mono">{o.quantity}</td>
                  <td className="table-td">
                    <span className={`badge ${statusColor[o.status]}`}>{o.status}</span>
                  </td>
                  {canAct && (
                    <td className="table-td">
                      {o.status === "RESERVED" && (
                        <button className="btn-secondary text-xs py-1" onClick={() => handleCancel(o.id, o.customerName)}>
                          Cancel & release
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td className="table-td text-ink-faint py-8 text-center" colSpan={5}>
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
