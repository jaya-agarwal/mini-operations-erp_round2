import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

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
  RESERVED: "bg-blue-100 text-blue-700",
  FULFILLED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function OrdersPage() {
  const { user } = useAuth();
  const canAct = user?.role === "ADMIN" || user?.role === "SALES";

  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    load().catch((e) => setError(apiErrorMessage(e)));
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
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleCancel(id: string) {
    setError(null);
    try {
      await api.post(`/orders/${id}/cancel`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Customer Orders</h1>
          <p className="text-sm text-gray-500">Reservations are concurrency-safe — see README for how</p>
        </div>
        {canAct && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Order"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600">Customer Name</label>
            <input
              className="input mt-1"
              required
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Location</label>
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
            <label className="text-xs font-medium text-gray-600">Item / Batch</label>
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
            <label className="text-xs font-medium text-gray-600">Quantity</label>
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
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Customer</th>
              <th className="table-th">Item</th>
              <th className="table-th">Qty</th>
              <th className="table-th">Status</th>
              {canAct && <th className="table-th"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="table-td font-medium">{o.customerName}</td>
                <td className="table-td">{o.item.name}</td>
                <td className="table-td">{o.quantity}</td>
                <td className="table-td">
                  <span className={`badge ${statusColor[o.status]}`}>{o.status}</span>
                </td>
                {canAct && (
                  <td className="table-td">
                    {o.status === "RESERVED" && (
                      <button className="btn-secondary text-xs" onClick={() => handleCancel(o.id)}>
                        Cancel & Release
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="table-td text-gray-400" colSpan={5}>
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
