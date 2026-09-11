import { prisma } from "../../lib/prisma";

// Low-stock threshold: a batch is flagged when available quantity falls at
// or below this. Kept simple/fixed for the demo rather than per-item
// reorder points, which would be the natural next iteration.
const LOW_STOCK_THRESHOLD = 15;

function available(b: { physicalQuantity: number; reservedQuantity: number; damagedQuantity: number }) {
  return b.physicalQuantity - b.reservedQuantity - b.damagedQuantity;
}

const ACTIVITY_LABEL: Record<string, string> = {
  RECEIPT: "Stock received",
  RESERVE: "Stock reserved",
  RELEASE_RESERVATION: "Reservation released",
  TRANSFER_DISPATCH: "Transfer dispatched",
  TRANSFER_RECEIPT: "Transfer received",
  DAMAGE: "Marked damaged",
  ADJUSTMENT: "Adjusted",
};

export async function getDashboardStats() {
  const [batches, workOrders, transfers, orders, recentTx] = await Promise.all([
    prisma.inventoryBatch.findMany({
      include: { item: { include: { category: true } }, location: true },
    }),
    prisma.workOrder.findMany({ select: { status: true } }),
    prisma.transfer.findMany({ select: { status: true } }),
    prisma.customerOrder.findMany({ select: { status: true, quantity: true } }),
    prisma.inventoryTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        batch: { include: { item: true, location: true } },
      },
    }),
  ]);

  const totals = batches.reduce(
    (acc, b) => {
      acc.physical += b.physicalQuantity;
      acc.reserved += b.reservedQuantity;
      acc.damaged += b.damagedQuantity;
      acc.available += available(b);
      return acc;
    },
    { physical: 0, reserved: 0, damaged: 0, available: 0 }
  );

  const lowStock = batches
    .map((b) => ({
      id: b.id,
      item: b.item.name,
      sku: b.item.sku,
      location: b.location.name,
      batchCode: b.batchCode,
      available: available(b),
    }))
    .filter((b) => b.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available)
    .slice(0, 8);

  const byCategory = new Map<string, number>();
  for (const b of batches) {
    const key = b.item.category.name;
    byCategory.set(key, (byCategory.get(key) ?? 0) + available(b));
  }

  function countBy<T extends string>(rows: { status: T }[]) {
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  const reservedUnits = orders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.quantity, 0);

  const activity = recentTx.map((tx) => ({
    id: tx.id,
    type: tx.type,
    label: ACTIVITY_LABEL[tx.type] ?? tx.type,
    quantity: tx.quantity,
    item: tx.batch.item.name,
    location: tx.batch.location.name,
    createdAt: tx.createdAt,
  }));

  return {
    inventory: {
      ...totals,
      batchCount: batches.length,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    },
    lowStock,
    stockByCategory: Array.from(byCategory.entries()).map(([name, available]) => ({ name, available })),
    workOrders: countBy(workOrders as { status: string }[]),
    transfers: countBy(transfers as { status: string }[]),
    orders: { ...countBy(orders as { status: string }[]), reservedUnits },
    activity,
  };
}
