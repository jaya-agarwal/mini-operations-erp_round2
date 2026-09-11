import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

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
  ASSIGNED: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
};

export default function WorkOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [users, setUsers] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    load().catch((e) => setError(apiErrorMessage(e)));
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
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function updateStatus(id: string, status: string) {
    setError(null);
    try {
      await api.patch(`/work-orders/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Work Orders</h1>
          <p className="text-sm text-gray-500">Shortage is calculated automatically against live stock</p>
        </div>
        {user?.role === "ADMIN" && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Work Order"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600">Item</label>
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
            <label className="text-xs font-medium text-gray-600">Location</label>
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
            <label className="text-xs font-medium text-gray-600">Required Qty</label>
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
            <label className="text-xs font-medium text-gray-600">Assigned User</label>
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
          <thead className="bg-gray-50 border-b border-gray-200">
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
          <tbody className="divide-y divide-gray-100">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="table-td font-medium">{o.item.name}</td>
                <td className="table-td">{o.location.name}</td>
                <td className="table-td">{o.assignedUser.name}</td>
                <td className="table-td">{o.requiredQuantity}</td>
                <td className="table-td">{o.availableAtLocation}</td>
                <td className="table-td">
                  {o.shortage > 0 ? (
                    <span className="badge bg-red-100 text-red-700">{o.shortage} short</span>
                  ) : (
                    <span className="badge bg-green-100 text-green-700">OK</span>
                  )}
                </td>
                <td className="table-td">
                  <span className={`badge ${statusColor[o.status]}`}>{o.status}</span>
                </td>
                <td className="table-td">
                  {o.status !== "COMPLETED" && (
                    <select
                      className="input text-xs py-1"
                      value=""
                      onChange={(e) => e.target.value && updateStatus(o.id, e.target.value)}
                    >
                      <option value="">Move to...</option>
                      {o.status === "ASSIGNED" && <option value="IN_PROGRESS">In Progress</option>}
                      {o.status === "IN_PROGRESS" && <option value="COMPLETED">Completed</option>}
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="table-td text-gray-400" colSpan={8}>
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
