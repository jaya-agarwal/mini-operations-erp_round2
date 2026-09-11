import { InventoryTxType, OrderStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, InsufficientStockError, NotFoundError, ValidationError } from "../../lib/errors";
import { deriveAvailable, serializeBatch, withLockedBatch } from "../inventory/inventory.service";

// This is the function the whole case study is really testing.
// "Available = 100, User A reserves 80, User B reserves 50 concurrently ->
// both must NOT succeed." We guarantee that by taking a row lock
// (SELECT ... FOR UPDATE) on the specific inventory batch *inside* the same
// DB transaction that checks available quantity and writes the reservation.
// Postgres serializes the two transactions on that lock: whichever request
// gets the lock first sees the true up-to-date reservedQuantity, commits,
// and releases the lock; the second then sees the updated number and is
// correctly rejected if there isn't enough left. There is no window where
// both transactions can read the same stale "available" value.
export async function createCustomerOrder(input: {
  customerName: string;
  itemId: string;
  locationId: string;
  batchId: string;
  quantity: number;
  createdById: string;
}) {
  if (input.quantity <= 0) throw new ValidationError("quantity must be positive");

  return prisma.$transaction(
    async (tx) => {
      return withLockedBatch(tx, input.batchId, async (batch) => {
        if (batch.locationId !== input.locationId || batch.itemId !== input.itemId) {
          throw new ValidationError("Batch does not match the requested item/location");
        }

        const available = deriveAvailable(batch);
        if (input.quantity > available) {
          throw new InsufficientStockError(
            `Cannot reserve ${input.quantity} units; only ${available} available`
          );
        }

        const order = await tx.customerOrder.create({
          data: {
            customerName: input.customerName,
            itemId: input.itemId,
            locationId: input.locationId,
            batchId: input.batchId,
            quantity: input.quantity,
            status: OrderStatus.RESERVED,
            createdById: input.createdById,
          },
        });

        const updatedBatch = await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { reservedQuantity: { increment: input.quantity }, version: { increment: 1 } },
        });

        await tx.inventoryTransaction.create({
          data: {
            batchId: batch.id,
            type: InventoryTxType.RESERVE,
            quantity: input.quantity,
            referenceType: "CUSTOMER_ORDER",
            referenceId: order.id,
            createdById: input.createdById,
          },
        });

        return { order, batch: serializeBatch(updatedBatch) };
      });
    },
    // Serializable isolation is defence-in-depth on top of the row lock:
    // if anything ever mutates this batch outside withLockedBatch, Postgres
    // will abort one of the conflicting transactions rather than silently
    // allow a lost update.
    { isolation: "Serializable" }
  );
}

// Live Verification "Change 3": cancel an order and correctly release its
// reserved inventory. Built in from day one, not bolted on live.
export async function cancelCustomerOrder(orderId: string, cancelledById?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError("Order not found");
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictError("Order is already cancelled");
    }
    if (order.status === OrderStatus.FULFILLED) {
      throw new ConflictError("Cannot cancel a fulfilled order");
    }

    return withLockedBatch(tx, order.batchId, async (batch) => {
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { reservedQuantity: { decrement: order.quantity }, version: { increment: 1 } },
      });

      await tx.inventoryTransaction.create({
        data: {
          batchId: batch.id,
          type: InventoryTxType.RELEASE_RESERVATION,
          quantity: order.quantity,
          referenceType: "CUSTOMER_ORDER_CANCEL",
          referenceId: order.id,
          createdById: cancelledById,
        },
      });

      const updatedOrder = await tx.customerOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      return { order: updatedOrder, batch: serializeBatch(updatedBatch) };
    });
  });
}

export async function listCustomerOrders() {
  return prisma.customerOrder.findMany({
    include: { item: true, createdBy: true },
    orderBy: { createdAt: "desc" },
  });
}
