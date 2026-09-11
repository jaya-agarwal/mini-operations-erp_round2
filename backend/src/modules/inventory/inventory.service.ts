import { InventoryTxType, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { InsufficientStockError, NotFoundError, ValidationError } from "../../lib/errors";

type Tx = Prisma.TransactionClient;

export function deriveAvailable(batch: { physicalQuantity: number; reservedQuantity: number; damagedQuantity: number }) {
  return batch.physicalQuantity - batch.reservedQuantity - batch.damagedQuantity;
}

export function serializeBatch(batch: {
  id: string;
  itemId: string;
  locationId: string;
  batchCode: string;
  physicalQuantity: number;
  reservedQuantity: number;
  damagedQuantity: number;
}) {
  return {
    ...batch,
    availableQuantity: deriveAvailable(batch),
  };
}

export async function listInventory(filters: { locationId?: string; itemId?: string }) {
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      locationId: filters.locationId,
      itemId: filters.itemId,
    },
    include: { item: { include: { category: true } }, location: true },
    orderBy: { createdAt: "asc" },
  });
  return batches.map((b) => ({ ...serializeBatch(b), item: b.item, location: b.location }));
}

export async function createInventoryBatch(input: {
  itemId: string;
  locationId: string;
  batchCode: string;
  physicalQuantity: number;
  createdById?: string;
}) {
  if (input.physicalQuantity < 0) {
    throw new ValidationError("physicalQuantity cannot be negative");
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.create({
      data: {
        itemId: input.itemId,
        locationId: input.locationId,
        batchCode: input.batchCode,
        physicalQuantity: input.physicalQuantity,
        reservedQuantity: 0,
        damagedQuantity: 0,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        batchId: batch.id,
        type: InventoryTxType.RECEIPT,
        quantity: input.physicalQuantity,
        referenceType: "INVENTORY_BATCH_CREATE",
        referenceId: batch.id,
        createdById: input.createdById,
      },
    });

    return serializeBatch(batch);
  });
}

// Shared helper: every module that mutates a batch's numbers (reserve,
// release, dispatch, receive, damage) goes through this so the row-lock +
// version-bump discipline is applied identically everywhere. This is the
// single mechanism that makes "two users reserve 80 and 50 out of 100 stock,
// both must not succeed" actually hold under concurrency.
export async function withLockedBatch<T>(
  tx: Tx,
  batchId: string,
  fn: (batch: {
    id: string;
    itemId: string;
    locationId: string;
    physicalQuantity: number;
    reservedQuantity: number;
    damagedQuantity: number;
    version: number;
  }) => Promise<T>
): Promise<T> {
  // SELECT ... FOR UPDATE takes a row-level lock for the duration of this
  // transaction. Any concurrent transaction trying to lock the same row
  // blocks until this one commits or rolls back — that's what turns a
  // read-check-write race into a safe, serialized sequence.
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      itemId: string;
      locationId: string;
      physicalQuantity: number;
      reservedQuantity: number;
      damagedQuantity: number;
      version: number;
    }>
  >`SELECT id, "itemId", "locationId", "physicalQuantity", "reservedQuantity", "damagedQuantity", version
    FROM inventory_batches WHERE id = ${batchId} FOR UPDATE`;

  const batch = rows[0];
  if (!batch) throw new NotFoundError("Inventory batch not found");

  return fn(batch);
}

// Live Verification "Change 1": add a DAMAGED status that automatically
// reduces available stock. Implemented up front — damagedQuantity is a
// first-class column and deriveAvailable() already subtracts it, so marking
// stock damaged immediately reduces availableQuantity with no further work.
export async function markStockDamaged(input: {
  batchId: string;
  quantity: number;
  createdById?: string;
  referenceId?: string;
}) {
  if (input.quantity <= 0) throw new ValidationError("quantity must be positive");

  return prisma.$transaction(async (tx) => {
    return withLockedBatch(tx, input.batchId, async (batch) => {
      const available = deriveAvailable(batch);
      if (input.quantity > available) {
        throw new InsufficientStockError(
          `Cannot mark ${input.quantity} units damaged; only ${available} available`
        );
      }

      const referenceId = input.referenceId ?? `${input.batchId}-damage-${Date.now()}`;

      const updated = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          damagedQuantity: { increment: input.quantity },
          version: { increment: 1 },
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          batchId: batch.id,
          type: InventoryTxType.DAMAGE,
          quantity: input.quantity,
          referenceType: "DAMAGE_ADJUSTMENT",
          referenceId,
          createdById: input.createdById,
        },
      });

      return serializeBatch(updated);
    });
  });
}
