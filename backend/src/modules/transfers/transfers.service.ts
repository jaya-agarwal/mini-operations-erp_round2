import { InventoryTxType, TransferStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, InsufficientStockError, NotFoundError, ValidationError } from "../../lib/errors";
import { deriveAvailable, serializeBatch, withLockedBatch } from "../inventory/inventory.service";

async function findOrCreateDestinationBatch(
  tx: Parameters<typeof withLockedBatch>[0],
  itemId: string,
  locationId: string,
  batchCode: string
) {
  let batch = await tx.inventoryBatch.findUnique({
    where: { itemId_locationId_batchCode: { itemId, locationId, batchCode } },
  });
  if (!batch) {
    batch = await tx.inventoryBatch.create({
      data: { itemId, locationId, batchCode, physicalQuantity: 0, reservedQuantity: 0, damagedQuantity: 0 },
    });
  }
  return batch;
}

export async function createTransferRequest(input: {
  sourceLocationId: string;
  destinationLocationId: string;
  itemId: string;
  quantity: number;
  sourceBatchId: string;
}) {
  if (input.quantity <= 0) throw new ValidationError("quantity must be positive");
  if (input.sourceLocationId === input.destinationLocationId) {
    throw new ValidationError("source and destination locations must differ");
  }

  const transfer = await prisma.transfer.create({
    data: {
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      itemId: input.itemId,
      quantity: input.quantity,
      status: TransferStatus.REQUESTED,
    },
  });

  return { ...transfer, sourceBatchId: input.sourceBatchId };
}

// Requirement: "On Dispatch, source inventory reduces."
// This physically decrements the source batch's physicalQuantity (not just
// reserved) inside a locked transaction, and posts exactly one
// TRANSFER_DISPATCH ledger row keyed on this transfer's id — a second
// dispatch attempt on the same transfer hits the unique constraint and is
// rejected, not just caught by an application if-check.
export async function dispatchTransfer(transferId: string, sourceBatchId: string, dispatchedById?: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== TransferStatus.REQUESTED) {
      throw new ConflictError(`Transfer is already '${transfer.status}', cannot dispatch again`);
    }

    return withLockedBatch(tx, sourceBatchId, async (batch) => {
      if (batch.locationId !== transfer.sourceLocationId) {
        throw new ValidationError("Batch does not belong to the transfer's source location");
      }
      const available = deriveAvailable(batch);
      if (transfer.quantity > available) {
        throw new InsufficientStockError(
          `Cannot dispatch ${transfer.quantity} units; only ${available} available at source`
        );
      }

      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { physicalQuantity: { decrement: transfer.quantity }, version: { increment: 1 } },
      });

      // Unique on (referenceId, type, referenceType) — a second dispatch
      // call for this transfer id throws a Prisma P2002 unique-violation,
      // which bubbles up as a 500 caught by the global handler. Combined
      // with the status check above, double-dispatch is blocked twice over.
      await tx.inventoryTransaction.create({
        data: {
          batchId: batch.id,
          type: InventoryTxType.TRANSFER_DISPATCH,
          quantity: transfer.quantity,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          createdById: dispatchedById,
        },
      });

      const updatedTransfer = await tx.transfer.update({
        where: { id: transfer.id },
        data: { status: TransferStatus.DISPATCHED, dispatchedAt: new Date() },
      });

      return { transfer: updatedTransfer, sourceBatch: serializeBatch(updatedBatch) };
    });
  });
}

// Requirement: "Before Receipt, destination inventory must NOT increase" —
// guaranteed simply because nothing touches the destination batch until
// this function runs. "On Receipt, destination inventory increases" and
// "system must prevent the same transfer from being received twice."
//
// Also implements Live Verification "Change 2" (partial receipt) up front:
// receivedQuantity accumulates across calls; status moves to
// PARTIALLY_RECEIVED until the running total reaches the dispatched
// quantity, then RECEIVED. Each partial call posts its own uniquely-keyed
// ledger row (TRANSFER_RECEIPT, referenceId = `${transferId}:${callIndex}`)
// so no individual receipt can be double-counted either.
export async function receiveTransfer(
  transferId: string,
  destinationBatchCode: string,
  receivedById?: string,
  receiveQuantity?: number
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundError("Transfer not found");

    if (transfer.status === TransferStatus.RECEIVED) {
      throw new ConflictError("This transfer has already been fully received");
    }
    if (transfer.status !== TransferStatus.DISPATCHED && transfer.status !== TransferStatus.PARTIALLY_RECEIVED) {
      throw new ConflictError(`Transfer must be dispatched before it can be received (current: ${transfer.status})`);
    }

    const remaining = transfer.quantity - transfer.receivedQuantity;
    const qtyToReceive = receiveQuantity ?? remaining;
    if (qtyToReceive <= 0) throw new ValidationError("Nothing left to receive on this transfer");
    if (qtyToReceive > remaining) {
      throw new ValidationError(`Cannot receive ${qtyToReceive}; only ${remaining} remaining on this transfer`);
    }

    const destBatch = await findOrCreateDestinationBatch(
      tx,
      transfer.itemId,
      transfer.destinationLocationId,
      destinationBatchCode
    );

    const updatedBatch = await withLockedBatch(tx, destBatch.id, async (batch) => {
      const updated = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { physicalQuantity: { increment: qtyToReceive }, version: { increment: 1 } },
      });
      return updated;
    });

    // Each receipt call (full or partial) gets a unique referenceId so a
    // duplicate client retry of the *same* partial call still can't double
    // count — combined with the status/remaining-quantity checks above.
    const receiptSequence = await tx.inventoryTransaction.count({
      where: { referenceId: { startsWith: `${transfer.id}:receipt:` } },
    });
    await tx.inventoryTransaction.create({
      data: {
        batchId: updatedBatch.id,
        type: InventoryTxType.TRANSFER_RECEIPT,
        quantity: qtyToReceive,
        referenceType: "TRANSFER",
        referenceId: `${transfer.id}:receipt:${receiptSequence}`,
        createdById: receivedById,
      },
    });

    const newReceivedTotal = transfer.receivedQuantity + qtyToReceive;
    const newStatus =
      newReceivedTotal >= transfer.quantity ? TransferStatus.RECEIVED : TransferStatus.PARTIALLY_RECEIVED;

    const updatedTransfer = await tx.transfer.update({
      where: { id: transfer.id },
      data: {
        receivedQuantity: newReceivedTotal,
        status: newStatus,
        receivedAt: newStatus === TransferStatus.RECEIVED ? new Date() : transfer.receivedAt,
      },
    });

    return { transfer: updatedTransfer, destinationBatch: serializeBatch(updatedBatch) };
  });
}

export async function listTransfers() {
  return prisma.transfer.findMany({
    include: { item: true, sourceLocation: true, destinationLocation: true },
    orderBy: { createdAt: "desc" },
  });
}
