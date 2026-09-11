import { FormEvent, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Search, TriangleAlert } from "lucide-react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

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

const LOW_STOCK = 15;

export default function InventoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    load()
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.item.name.toLowerCase().includes(q) ||
        b.item.sku.toLowerCase().includes(q) ||
        b.location.name.toLowerCase().includes(q) ||
        b.batchCode.toLowerCase().includes(q)
    );
  }, [batches, query]);

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
      toast.push("Stock received into inventory");
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
      toast.push(`Marked ${damageQty} unit(s) of ${damageTarget.item.name} as damaged`, "info");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Boxes size={19} className="text-amber-600" />
            Inventory
          </h1>
          <p className="text-sm text-ink-muted">Available = Physical − Reserved − Damaged</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} />
            {showForm ? "Cancel" : "Receive stock"}
          </button>
        )}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          className="input pl-9"
          placeholder="Search item, SKU, location, batch…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
            <label className="text-xs font-medium text-ink-muted">Batch code</label>
            <input
              className="input mt-1"
              required
              value={form.batchCode}
              onChange={(e) => setForm({ ...form, batchCode: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Quantity</label>
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
          <thead className="bg-paper border-b border-paper-border dark:bg-steel-800 dark:border-steel-700">
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
          <tbody className="divide-y divide-paper-border dark:divide-steel-700">
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-3 py-3">
                    <div className="h-3.5 rounded bg-paper-border/60 dark:bg-steel-700 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading &&
              filtered.map((b) => {
                const low = b.availableQuantity <= LOW_STOCK;
                return (
                  <tr key={b.id} className={low ? "flag-row" : undefined}>
                    <td className="table-td font-medium">
                      {b.item.name}
                      <span className="block text-xs text-ink-faint font-mono">{b.item.sku}</span>
                    </td>
                    <td className="table-td">{b.location.name}</td>
                    <td className="table-td text-ink-faint font-mono">{b.batchCode}</td>
                    <td className="table-td table-mono">{b.physicalQuantity}</td>
                    <td className="table-td table-mono">{b.reservedQuantity}</td>
                    <td className="table-td table-mono">{b.damagedQuantity}</td>
                    <td className="table-td table-mono font-semibold">
                      <span className={low ? "text-amber-700 flex items-center gap-1" : "text-ink"}>
                        {low && <TriangleAlert size={13} />}
                        {b.availableQuantity}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-td">
                        <button className="btn-secondary text-xs py-1" onClick={() => setDamageTarget(b)}>
                          Mark damaged
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="table-td text-ink-faint py-8 text-center" colSpan={8}>
                  {batches.length === 0 ? "No inventory received yet." : "No batches match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {damageTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <form onSubmit={handleMarkDamaged} className="card p-5 w-80 space-y-3 shadow-pop">
            <h2 className="font-semibold">Mark stock damaged</h2>
            <p className="text-xs text-ink-muted">
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
