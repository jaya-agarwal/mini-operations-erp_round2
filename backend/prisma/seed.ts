import { PrismaClient, Role, InventoryTxType, TransferStatus, OrderStatus, WorkOrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");

  // ---------------------------------------------------------------------
  // Locations, users, categories — idempotent (safe to re-run)
  // ---------------------------------------------------------------------
  const warehouseA = await prisma.location.upsert({
    where: { name: "Warehouse A" },
    update: {},
    create: { name: "Warehouse A" },
  });
  const warehouseB = await prisma.location.upsert({
    where: { name: "Warehouse B" },
    update: {},
    create: { name: "Warehouse B" },
  });
  const distributionHub = await prisma.location.upsert({
    where: { name: "Distribution Hub" },
    update: {},
    create: { name: "Distribution Hub" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@minierp.test" },
    update: {},
    create: { email: "admin@minierp.test", name: "Alex Admin", passwordHash, role: Role.ADMIN },
  });
  const ops = await prisma.user.upsert({
    where: { email: "ops@minierp.test" },
    update: {},
    create: {
      email: "ops@minierp.test",
      name: "Olivia Ops",
      passwordHash,
      role: Role.OPERATIONS,
      assignedLocationId: warehouseA.id,
    },
  });
  const sales = await prisma.user.upsert({
    where: { email: "sales@minierp.test" },
    update: {},
    create: { email: "sales@minierp.test", name: "Sam Sales", passwordHash, role: Role.SALES },
  });

  const categoryNames = ["Power Tools", "Hand Tools", "Safety Equipment", "Fasteners"];
  const categories: Record<string, { id: string }> = {};
  for (const name of categoryNames) {
    categories[name] = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const itemDefs = [
    { sku: "SKU-001", name: "Cordless Drill", category: "Power Tools" },
    { sku: "SKU-002", name: "Angle Grinder", category: "Power Tools" },
    { sku: "SKU-003", name: "Claw Hammer", category: "Hand Tools" },
    { sku: "SKU-004", name: "Adjustable Wrench", category: "Hand Tools" },
    { sku: "SKU-005", name: "Safety Helmet", category: "Safety Equipment" },
    { sku: "SKU-006", name: "Work Gloves (pair)", category: "Safety Equipment" },
    { sku: "SKU-007", name: "Hex Bolts M8 (100-pack)", category: "Fasteners" },
    { sku: "SKU-008", name: "Steel Washers M8 (200-pack)", category: "Fasteners" },
  ];
  const items: Record<string, { id: string }> = {};
  for (const def of itemDefs) {
    items[def.sku] = await prisma.item.upsert({
      where: { sku: def.sku },
      update: {},
      create: { sku: def.sku, name: def.name, categoryId: categories[def.category].id },
    });
  }

  console.log("Locations, users, categories, and items are in place.");

  // ---------------------------------------------------------------------
  // Everything below (batches, work orders, transfers, orders) only runs
  // once — guarded on inventory already existing — so re-running
  // `npm run seed` never duplicates demo transactions.
  // ---------------------------------------------------------------------
  const alreadySeeded = await prisma.inventoryBatch.count();
  if (alreadySeeded > 0) {
    console.log("Demo inventory already present — skipping batch/transfer/order seed.");
    console.log("Seed complete.");
    return;
  }

  async function receiveBatch(
    itemSku: string,
    location: { id: string },
    batchCode: string,
    physicalQuantity: number
  ) {
    return prisma.inventoryBatch.create({
      data: {
        itemId: items[itemSku].id,
        locationId: location.id,
        batchCode,
        physicalQuantity,
        reservedQuantity: 0,
        damagedQuantity: 0,
      },
    }).then(async (batch) => {
      await prisma.inventoryTransaction.create({
        data: {
          batchId: batch.id,
          type: InventoryTxType.RECEIPT,
          quantity: physicalQuantity,
          referenceType: "INVENTORY_BATCH_CREATE",
          referenceId: batch.id,
          createdById: ops.id,
        },
      });
      return batch;
    });
  }

  async function damageBatch(batchId: string, quantity: number) {
    await prisma.inventoryBatch.update({ where: { id: batchId }, data: { damagedQuantity: { increment: quantity } } });
    await prisma.inventoryTransaction.create({
      data: {
        batchId,
        type: InventoryTxType.DAMAGE,
        quantity,
        referenceType: "DAMAGE_REPORT",
        referenceId: `${batchId}-damage-seed`,
        createdById: ops.id,
      },
    });
  }

  async function reserveForOrder(
    customerName: string,
    itemSku: string,
    location: { id: string },
    batchId: string,
    quantity: number
  ) {
    const order = await prisma.customerOrder.create({
      data: {
        customerName,
        itemId: items[itemSku].id,
        locationId: location.id,
        batchId,
        quantity,
        status: OrderStatus.RESERVED,
        createdById: sales.id,
      },
    });
    await prisma.inventoryBatch.update({ where: { id: batchId }, data: { reservedQuantity: { increment: quantity } } });
    await prisma.inventoryTransaction.create({
      data: {
        batchId,
        type: InventoryTxType.RESERVE,
        quantity,
        referenceType: "CUSTOMER_ORDER",
        referenceId: order.id,
        createdById: sales.id,
      },
    });
    return order;
  }

  async function cancelOrder(order: { id: string; batchId: string; quantity: number }) {
    await prisma.inventoryBatch.update({
      where: { id: order.batchId },
      data: { reservedQuantity: { decrement: order.quantity } },
    });
    await prisma.inventoryTransaction.create({
      data: {
        batchId: order.batchId,
        type: InventoryTxType.RELEASE_RESERVATION,
        quantity: order.quantity,
        referenceType: "CUSTOMER_ORDER_CANCEL",
        referenceId: order.id,
        createdById: sales.id,
      },
    });
    await prisma.customerOrder.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() } });
  }

  console.log("Receiving inventory batches across all three locations...");

  const drillA = await receiveBatch("SKU-001", warehouseA, "BATCH-001", 120);
  const drillB = await receiveBatch("SKU-001", warehouseB, "BATCH-101", 40);
  const grinderA = await receiveBatch("SKU-002", warehouseA, "BATCH-002", 18);
  const grinderC = await receiveBatch("SKU-002", distributionHub, "BATCH-201", 25);
  const hammerA = await receiveBatch("SKU-003", warehouseA, "BATCH-003", 200);
  const wrenchB = await receiveBatch("SKU-004", warehouseB, "BATCH-102", 90);
  const helmetA = await receiveBatch("SKU-005", warehouseA, "BATCH-004", 10);
  const glovesC = await receiveBatch("SKU-006", distributionHub, "BATCH-202", 150);
  const boltsB = await receiveBatch("SKU-007", warehouseB, "BATCH-103", 500);
  await receiveBatch("SKU-008", warehouseA, "BATCH-005", 300);

  console.log("Marking some stock damaged...");
  await damageBatch(drillB.id, 5);
  await damageBatch(glovesC.id, 10);

  console.log("Reserving stock against customer orders...");
  await reserveForOrder("Acme Construction", "SKU-001", warehouseA, drillA.id, 30);
  await reserveForOrder("BuildRight Co", "SKU-002", warehouseA, grinderA.id, 6);
  await reserveForOrder("Summit Contractors", "SKU-003", warehouseA, hammerA.id, 40);
  await reserveForOrder("Union Electric", "SKU-004", warehouseB, wrenchB.id, 20);
  await reserveForOrder("Coastal Safety Supply", "SKU-005", warehouseA, helmetA.id, 2);
  await reserveForOrder("Harbor Industrial", "SKU-006", distributionHub, glovesC.id, 50);
  await reserveForOrder("Rigging Solutions", "SKU-007", warehouseB, boltsB.id, 100);

  console.log("Seeding one cancelled order, to show reservation release in the activity ledger...");
  const cancelledOrder = await reserveForOrder("Northgate Renovations", "SKU-001", warehouseA, drillA.id, 15);
  await cancelOrder(cancelledOrder);

  console.log("Creating work orders across every status, including two with a real material shortage...");
  await prisma.workOrder.create({
    data: {
      itemId: items["SKU-001"].id,
      locationId: warehouseA.id,
      requiredQuantity: 50,
      assignedUserId: ops.id,
      status: WorkOrderStatus.IN_PROGRESS,
    },
  });
  await prisma.workOrder.create({
    data: {
      itemId: items["SKU-002"].id,
      locationId: warehouseA.id,
      requiredQuantity: 20, // available at Warehouse A is 12 -> shortage of 8
      assignedUserId: ops.id,
      status: WorkOrderStatus.ASSIGNED,
    },
  });
  await prisma.workOrder.create({
    data: {
      itemId: items["SKU-003"].id,
      locationId: warehouseA.id,
      requiredQuantity: 100,
      assignedUserId: admin.id,
      status: WorkOrderStatus.COMPLETED,
    },
  });
  await prisma.workOrder.create({
    data: {
      itemId: items["SKU-005"].id,
      locationId: warehouseA.id,
      requiredQuantity: 12, // available at Warehouse A is 8 -> shortage of 4
      assignedUserId: ops.id,
      status: WorkOrderStatus.ASSIGNED,
    },
  });
  await prisma.workOrder.create({
    data: {
      itemId: items["SKU-004"].id,
      locationId: warehouseB.id,
      requiredQuantity: 30,
      assignedUserId: sales.id,
      status: WorkOrderStatus.IN_PROGRESS,
    },
  });

  console.log("Creating transfers at every stage of the lifecycle...");

  // 1. REQUESTED — untouched inventory, waiting on Operations to dispatch.
  await prisma.transfer.create({
    data: {
      itemId: items["SKU-007"].id,
      sourceLocationId: warehouseB.id,
      destinationLocationId: distributionHub.id,
      quantity: 50,
      status: TransferStatus.REQUESTED,
    },
  });

  // 2. DISPATCHED — source has already been decremented, destination has not moved yet.
  const washerTransfer = await prisma.transfer.create({
    data: {
      itemId: items["SKU-008"].id,
      sourceLocationId: warehouseA.id,
      destinationLocationId: warehouseB.id,
      quantity: 100,
      status: TransferStatus.DISPATCHED,
      dispatchedAt: new Date(),
    },
  });
  const washerBatchA = await prisma.inventoryBatch.findFirst({
    where: { itemId: items["SKU-008"].id, locationId: warehouseA.id },
  });
  await prisma.inventoryBatch.update({
    where: { id: washerBatchA!.id },
    data: { physicalQuantity: { decrement: 100 } },
  });
  await prisma.inventoryTransaction.create({
    data: {
      batchId: washerBatchA!.id,
      type: InventoryTxType.TRANSFER_DISPATCH,
      quantity: 100,
      referenceType: "TRANSFER",
      referenceId: washerTransfer.id,
      createdById: ops.id,
    },
  });

  // 3. PARTIALLY_RECEIVED — demonstrates Live Verification "Change 2".
  const hammerTransfer = await prisma.transfer.create({
    data: {
      itemId: items["SKU-003"].id,
      sourceLocationId: warehouseA.id,
      destinationLocationId: distributionHub.id,
      quantity: 60,
      receivedQuantity: 25,
      status: TransferStatus.PARTIALLY_RECEIVED,
      dispatchedAt: new Date(),
    },
  });
  await prisma.inventoryBatch.update({ where: { id: hammerA.id }, data: { physicalQuantity: { decrement: 60 } } });
  await prisma.inventoryTransaction.create({
    data: {
      batchId: hammerA.id,
      type: InventoryTxType.TRANSFER_DISPATCH,
      quantity: 60,
      referenceType: "TRANSFER",
      referenceId: hammerTransfer.id,
      createdById: ops.id,
    },
  });
  const hammerC = await prisma.inventoryBatch.create({
    data: {
      itemId: items["SKU-003"].id,
      locationId: distributionHub.id,
      batchCode: "BATCH-003-C",
      physicalQuantity: 25,
      reservedQuantity: 0,
      damagedQuantity: 0,
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      batchId: hammerC.id,
      type: InventoryTxType.TRANSFER_RECEIPT,
      quantity: 25,
      referenceType: "TRANSFER",
      referenceId: `${hammerTransfer.id}:receipt:0`,
      createdById: ops.id,
    },
  });

  // 4. RECEIVED — the full lifecycle, source decremented, destination increased, done.
  const grinderTransfer = await prisma.transfer.create({
    data: {
      itemId: items["SKU-002"].id,
      sourceLocationId: distributionHub.id,
      destinationLocationId: warehouseA.id,
      quantity: 10,
      receivedQuantity: 10,
      status: TransferStatus.RECEIVED,
      dispatchedAt: new Date(),
      receivedAt: new Date(),
    },
  });
  await prisma.inventoryBatch.update({ where: { id: grinderC.id }, data: { physicalQuantity: { decrement: 10 } } });
  await prisma.inventoryTransaction.create({
    data: {
      batchId: grinderC.id,
      type: InventoryTxType.TRANSFER_DISPATCH,
      quantity: 10,
      referenceType: "TRANSFER",
      referenceId: grinderTransfer.id,
      createdById: ops.id,
    },
  });
  const grinderA2 = await prisma.inventoryBatch.create({
    data: {
      itemId: items["SKU-002"].id,
      locationId: warehouseA.id,
      batchCode: "BATCH-002-A2",
      physicalQuantity: 10,
      reservedQuantity: 0,
      damagedQuantity: 0,
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      batchId: grinderA2.id,
      type: InventoryTxType.TRANSFER_RECEIPT,
      quantity: 10,
      referenceType: "TRANSFER",
      referenceId: `${grinderTransfer.id}:receipt:0`,
      createdById: ops.id,
    },
  });

  console.log("Seed complete.");
  console.log("Login with any of:");
  console.log("  admin@minierp.test / password123 (ADMIN)");
  console.log("  ops@minierp.test   / password123 (OPERATIONS, assigned to Warehouse A)");
  console.log("  sales@minierp.test / password123 (SALES)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });