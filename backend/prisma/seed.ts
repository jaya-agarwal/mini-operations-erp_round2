import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const [warehouseA, warehouseB] = await Promise.all([
    prisma.location.upsert({ where: { name: "Warehouse A" }, update: {}, create: { name: "Warehouse A" } }),
    prisma.location.upsert({ where: { name: "Warehouse B" }, update: {}, create: { name: "Warehouse B" } }),
  ]);

  const [admin, ops, sales] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@minierp.test" },
      update: {},
      create: { email: "admin@minierp.test", passwordHash, name: "Admin User", role: Role.ADMIN },
    }),
    prisma.user.upsert({
      where: { email: "ops@minierp.test" },
      update: {},
      create: {
        email: "ops@minierp.test",
        passwordHash,
        name: "Operations User",
        role: Role.OPERATIONS,
        assignedLocationId: warehouseA.id,
      },
    }),
    prisma.user.upsert({
      where: { email: "sales@minierp.test" },
      update: {},
      create: { email: "sales@minierp.test", passwordHash, name: "Sales User", role: Role.SALES },
    }),
  ]);

  const category = await prisma.category.upsert({
    where: { name: "Electronics" },
    update: {},
    create: { name: "Electronics" },
  });

  const item = await prisma.item.upsert({
    where: { sku: "SKU-001" },
    update: {},
    create: { name: "Cordless Drill", sku: "SKU-001", categoryId: category.id },
  });

  const existingBatch = await prisma.inventoryBatch.findUnique({
    where: {
      itemId_locationId_batchCode: {
        itemId: item.id,
        locationId: warehouseA.id,
        batchCode: "BATCH-001",
      },
    },
  });

  if (!existingBatch) {
    const batch = await prisma.inventoryBatch.create({
      data: {
        itemId: item.id,
        locationId: warehouseA.id,
        batchCode: "BATCH-001",
        physicalQuantity: 100,
      },
    });
    await prisma.inventoryTransaction.create({
      data: {
        batchId: batch.id,
        type: "RECEIPT",
        quantity: 100,
        referenceType: "SEED",
        referenceId: batch.id,
      },
    });
  }

  console.log("Seed complete.");
  console.log("Login with any of:");
  console.log(`  ${admin.email} / password123 (ADMIN)`);
  console.log(`  ${ops.email} / password123 (OPERATIONS, assigned to Warehouse A)`);
  console.log(`  ${sales.email} / password123 (SALES)`);
  console.log(`Warehouse B id (empty, for transfer testing): ${warehouseB.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
