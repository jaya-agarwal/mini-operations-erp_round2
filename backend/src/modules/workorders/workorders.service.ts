import { WorkOrderStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { deriveAvailable } from "../inventory/inventory.service";

// Required Material vs Available at Location -> Shortage, computed live
// rather than stored, so it's always correct even if inventory changes
// after the work order is created.
async function computeShortage(locationId: string, itemId: string, requiredQuantity: number) {
  const batches = await prisma.inventoryBatch.findMany({ where: { locationId, itemId } });
  const availableAtLocation = batches.reduce((sum, b) => sum + deriveAvailable(b), 0);
  const shortage = Math.max(0, requiredQuantity - availableAtLocation);
  return { availableAtLocation, shortage };
}

export async function createWorkOrder(input: {
  locationId: string;
  itemId: string;
  requiredQuantity: number;
  assignedUserId: string;
}) {
  if (input.requiredQuantity <= 0) throw new ValidationError("requiredQuantity must be positive");

  const workOrder = await prisma.workOrder.create({
    data: {
      locationId: input.locationId,
      itemId: input.itemId,
      requiredQuantity: input.requiredQuantity,
      assignedUserId: input.assignedUserId,
      status: WorkOrderStatus.ASSIGNED,
    },
    include: { location: true, item: true, assignedUser: true },
  });

  const stockCheck = await computeShortage(input.locationId, input.itemId, input.requiredQuantity);
  return { ...workOrder, ...stockCheck };
}

export async function listWorkOrders() {
  const orders = await prisma.workOrder.findMany({
    include: { location: true, item: true, assignedUser: true },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    orders.map(async (wo) => ({
      ...wo,
      ...(await computeShortage(wo.locationId, wo.itemId, wo.requiredQuantity)),
    }))
  );
}

export async function updateWorkOrderStatus(id: string, status: WorkOrderStatus) {
  const existing = await prisma.workOrder.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Work order not found");

  return prisma.workOrder.update({ where: { id }, data: { status } });
}
