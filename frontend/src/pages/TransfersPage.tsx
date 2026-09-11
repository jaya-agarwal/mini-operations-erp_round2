import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

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
  REQUESTED: "bg-gray-100 text-gray-700",
  DISPATCHED: "bg-amber-100 text-amber-700",
  PARTIALLY_RECEIVED: "bg-blue-100 text-blue-700",
  RECEIVED: "bg-green-100 text-green-700",
};

export default function TransfersPage() {
  const { user } = useAuth();
  const canAct = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Ref[]>([]);
  const [locations, setLocations] = useState<Ref[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    load().catch((e) => setError(apiErrorMessage(e)));
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
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Internal Transfers</h1>
          <p className="text-sm text-gray-500">Destination stock increases only after receipt — partial receipt supported</p>
        </div>
        {canAct && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Request Transfer"}
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600">Item</label>
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
            <label className="text-xs font-medium text-gray-600">Source</label>
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
            <label className="text-xs font-medium text-gray-600">Source Batch</label>
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
            <label className="text-xs font-medium text-gray-600">Destination</label>
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
            <label className="text-xs font-medium text-gray-600">Quantity</label>
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
          <thead className="bg-gray-50 border-b border-gray-200">
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
          <tbody className="divide-y divide-gray-100">
            {transfers.map((t) => (
              <tr key={t.id}>
                <td className="table-td font-medium">{t.item.name}</td>
                <td className="table-td">{t.sourceLocation.name}</td>
                <td className="table-td">{t.destinationLocation.name}</td>
                <td className="table-td">{t.quantity}</td>
                <td className="table-td">{t.receivedQuantity}</td>
                <td className="table-td">
                  <span className={`badge ${statusColor[t.status]}`}>{t.status.replace("_", " ")}</span>
                </td>
                {canAct && (
                  <td className="table-td space-x-2">
                    {t.status === "REQUESTED" && (
                      <button className="btn-secondary text-xs" onClick={() => handleDispatch(t)}>
                        Dispatch
                      </button>
                    )}
                    {(t.status === "DISPATCHED" || t.status === "PARTIALLY_RECEIVED") && (
                      <button
                        className="btn-secondary text-xs"
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
            ))}
            {transfers.length === 0 && (
              <tr>
                <td className="table-td text-gray-400" colSpan={7}>
                  No transfers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receiveTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <form onSubmit={handleReceive} className="card p-5 w-80 space-y-3">
            <h2 className="font-semibold">Receive transfer</h2>
            <p className="text-xs text-gray-500">
              {receiveTarget.item.name}: {receiveTarget.receivedQuantity}/{receiveTarget.quantity} received so far
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600">Destination batch code</label>
              <input
                className="input mt-1"
                required
                value={receiveForm.destinationBatchCode}
                onChange={(e) => setReceiveForm({ ...receiveForm, destinationBatchCode: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
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
                Confirm Receipt
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
