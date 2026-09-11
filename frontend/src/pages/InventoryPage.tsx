import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Batch {
  id: string;
  batchCode: string;
  physicalQuantity: number;
  reservedQuantity: number;
  damagedQuantity: number;
  availableQuantity: number;
  item: { name: string; sku: string; category: { name: string } };
  location: { name: string; id: string };
}
interface Ref {
  id: string;
  name: string;
}

export default function InventoryPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ itemId: "", locationId: "", batchCode: "", physicalQuantity: "" });
  const [damageTarget, setDamageTarget] = useState<Batch | null>(null);
  const [damageQty, setDamageQty] = useState("");

  async function load() {
    const [batchRes, itemRes, locRes] = await Promise.all([
      api.get("/inventory"),
      api.get("/items"),
      api.get("/locations"),
    ]);
    setBatches(batchRes.data.data);
    setItems(itemRes.data.data);
    setLocations(locRes.data.data);
  }

  useEffect(() => {
    load().catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/inventory", {
        itemId: form.itemId,
        locationId: form.locationId,
        batchCode: form.batchCode,
        physicalQuantity: Number(form.physicalQuantity),
      });
      setForm({ itemId: "", locationId: "", batchCode: "", physicalQuantity: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleMarkDamaged(e: FormEvent) {
    e.preventDefault();
    if (!damageTarget) return;
    setError(null);
    try {
      await api.post(`/inventory/${damageTarget.id}/damage`, { quantity: Number(damageQty) });
      setDamageTarget(null);
      setDamageQty("");
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-gray-500">Available = Physical − Reserved − Damaged</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Receive Stock"}
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
            <label className="text-xs font-medium text-gray-600">Batch Code</label>
            <input
              className="input mt-1"
              required
              value={form.batchCode}
              onChange={(e) => setForm({ ...form, batchCode: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Quantity</label>
            <input
              className="input mt-1"
              type="number"
              min={0}
              required
              value={form.physicalQuantity}
              onChange={(e) => setForm({ ...form, physicalQuantity: e.target.value })}
            />
          </div>
          <button className="btn-primary" type="submit">
            Save
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Item</th>
              <th className="table-th">Location</th>
              <th className="table-th">Batch</th>
              <th className="table-th">Physical</th>
              <th className="table-th">Reserved</th>
              <th className="table-th">Damaged</th>
              <th className="table-th">Available</th>
              {canEdit && <th className="table-th"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="table-td font-medium">{b.item.name}</td>
                <td className="table-td">{b.location.name}</td>
                <td className="table-td text-gray-400">{b.batchCode}</td>
                <td className="table-td">{b.physicalQuantity}</td>
                <td className="table-td">{b.reservedQuantity}</td>
                <td className="table-td">{b.damagedQuantity}</td>
                <td className="table-td font-semibold text-brand-700">{b.availableQuantity}</td>
                {canEdit && (
                  <td className="table-td">
                    <button className="btn-secondary text-xs" onClick={() => setDamageTarget(b)}>
                      Mark Damaged
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td className="table-td text-gray-400" colSpan={8}>
                  No inventory yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {damageTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <form onSubmit={handleMarkDamaged} className="card p-5 w-80 space-y-3">
            <h2 className="font-semibold">Mark stock damaged</h2>
            <p className="text-xs text-gray-500">
              {damageTarget.item.name} · {damageTarget.location.name} · available: {damageTarget.availableQuantity}
            </p>
            <input
              className="input"
              type="number"
              min={1}
              max={damageTarget.availableQuantity}
              placeholder="Quantity"
              required
              value={damageQty}
              onChange={(e) => setDamageQty(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setDamageTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
