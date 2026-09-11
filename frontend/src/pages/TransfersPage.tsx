import { FormEvent, useEffect, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

interface Transfer {
  id: string;
  quantity: number;
  receivedQuantity: number;
  status: string;
  item: { name: string };
  sourceLocation: { id: string; name: string };
  destinationLocation: { id: string; name: string };
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
  REQUESTED: "bg-steel-200 text-steel-700 dark:bg-steel-700 dark:text-steel-200",
  DISPATCHED: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  PARTIALLY_RECEIVED: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-200",
  RECEIVED: "bg-ok-50 text-ok-600 dark:bg-ok-500/15 dark:text-ok-500",
};

export default function TransfersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canAct = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    itemId: "",
    sourceLocationId: "",
    destinationLocationId: "",
    sourceBatchId: "",
    quantity: "",
  });
  const [receiveTarget, setReceiveTarget] = useState<Transfer | null>(null);
  const [receiveForm, setReceiveForm] = useState({ destinationBatchCode: "", quantity: "" });

  async function load() {
    const [tRes, bRes, iRes, lRes] = await Promise.all([
      api.get("/transfers"),
      api.get("/inventory"),
      api.get("/items"),
      api.get("/locations"),
    ]);
    setTransfers(tRes.data.data);
    setBatches(bRes.data.data);
    setItems(iRes.data.data);
    setLocations(lRes.data.data);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const sourceBatchesForForm = batches.filter(
    (b) => b.location.id === form.sourceLocationId && b.item.id === form.itemId
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/transfers", {
        itemId: form.itemId,
        sourceLocationId: form.sourceLocationId,
        destinationLocationId: form.destinationLocationId,
        sourceBatchId: form.sourceBatchId,
        quantity: Number(form.quantity),
      });
      setForm({ itemId: "", sourceLocationId: "", destinationLocationId: "", sourceBatchId: "", quantity: "" });
      setShowForm(false);
      await load();
      toast.push("Transfer requested");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleDispatch(t: Transfer) {
    setError(null);
    try {
      // We need the exact source batch id used at request time; simplest
      // reliable option here is to ask which batch to dispatch from among
      // this item's batches at the source location.
      const candidate = batches.find(
        (b) => b.location.name === t.sourceLocation.name && b.item.name === t.item.name
      );
      if (!candidate) throw new Error("No source batch found for this transfer's item/location");
      await api.post(`/transfers/${t.id}/dispatch`, { sourceBatchId: candidate.id });
      await load();
      toast.push(`${t.item.name} dispatched from ${t.sourceLocation.name}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleReceive(e: FormEvent) {
    e.preventDefault();
    if (!receiveTarget) return;
    setError(null);
    try {
      await api.post(`/transfers/${receiveTarget.id}/receive`, {
        destinationBatchCode: receiveForm.destinationBatchCode,
        quantity: receiveForm.quantity ? Number(receiveForm.quantity) : undefined,
      });
      setReceiveTarget(null);
      setReceiveForm({ destinationBatchCode: "", quantity: "" });
      await load();
      toast.push("Transfer receipt recorded");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-amber-600" />
            Internal Transfers
          </h1>
          <p className="text-sm text-ink-muted">Destination stock increases only after receipt — partial receipt supported</p>
        </div>
        {canAct && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} />
            {showForm ? "Cancel" : "Request transfer"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-danger-600 flag-row px-3 py-2 rounded">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-ink-muted">Item</label>
            <select
              className="input mt-1"
              required
              value={form.itemId}
              onChange={(e) => setForm({ ...form, itemId: e.target.value, sourceBatchId: "" })}
            >
              <option value="">Select</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Source</label>
            <select
              className="input mt-1"
              required
              value={form.sourceLocationId}
              onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value, sourceBatchId: "" })}
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
            <label className="text-xs font-medium text-ink-muted">Source batch</label>
            <select
              className="input mt-1"
              required
              value={form.sourceBatchId}
              onChange={(e) => setForm({ ...form, sourceBatchId: e.target.value })}
            >
              <option value="">Select</option>
              {sourceBatchesForForm.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchCode} (avail {b.availableQuantity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted">Destination</label>
            <select
              className="input mt-1"
              required
              value={form.destinationLocationId}
              onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })}
            >
              <option value="">Select</option>
              {locations
                .filter((l) => l.id !== form.sourceLocationId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <button className="btn-primary" type="submit">
            Request
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-paper border-b border-paper-border dark:bg-steel-800 dark:border-steel-700">
            <tr>
              <th className="table-th">Item</th>
              <th className="table-th">Source</th>
              <th className="table-th">Destination</th>
              <th className="table-th">Qty</th>
              <th className="table-th">Received</th>
              <th className="table-th">Status</th>
              {canAct && <th className="table-th"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border dark:divide-steel-700">
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <div className="h-3.5 rounded bg-paper-border/60 dark:bg-steel-700 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading &&
              transfers.map((t) => {
                const pending = t.status === "REQUESTED" || t.status === "DISPATCHED" || t.status === "PARTIALLY_RECEIVED";
                return (
                  <tr key={t.id} className={pending ? "flag-row" : undefined}>
                    <td className="table-td font-medium">{t.item.name}</td>
                    <td className="table-td">{t.sourceLocation.name}</td>
                    <td className="table-td">{t.destinationLocation.name}</td>
                    <td className="table-td table-mono">{t.quantity}</td>
                    <td className="table-td table-mono">{t.receivedQuantity}</td>
                    <td className="table-td">
                      <span className={`badge ${statusColor[t.status]}`}>{t.status.replace("_", " ")}</span>
                    </td>
                    {canAct && (
                      <td className="table-td space-x-2">
                        {t.status === "REQUESTED" && (
                          <button className="btn-secondary text-xs py-1" onClick={() => handleDispatch(t)}>
                            Dispatch
                          </button>
                        )}
                        {(t.status === "DISPATCHED" || t.status === "PARTIALLY_RECEIVED") && (
                          <button
                            className="btn-secondary text-xs py-1"
                            onClick={() => {
                              setReceiveTarget(t);
                              setReceiveForm({ destinationBatchCode: `${t.item.name}-B1`, quantity: "" });
                            }}
                          >
                            Receive
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            {!loading && transfers.length === 0 && (
              <tr>
                <td className="table-td text-ink-faint py-8 text-center" colSpan={7}>
                  No transfers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receiveTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <form onSubmit={handleReceive} className="card p-5 w-80 space-y-3 shadow-pop">
            <h2 className="font-semibold">Receive transfer</h2>
            <p className="text-xs text-ink-muted">
              {receiveTarget.item.name}: {receiveTarget.receivedQuantity}/{receiveTarget.quantity} received so far
            </p>
            <div>
              <label className="text-xs font-medium text-ink-muted">Destination batch code</label>
              <input
                className="input mt-1"
                required
                value={receiveForm.destinationBatchCode}
                onChange={(e) => setReceiveForm({ ...receiveForm, destinationBatchCode: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted">
                Quantity (leave blank to receive all remaining)
              </label>
              <input
                className="input mt-1"
                type="number"
                min={1}
                max={receiveTarget.quantity - receiveTarget.receivedQuantity}
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setReceiveTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Confirm receipt
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
