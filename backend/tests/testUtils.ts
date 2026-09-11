import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env";

export const prisma = new PrismaClient();

export async function resetDatabase() {
  // Order matters for FK constraints.
  await prisma.inventoryTransaction.deleteMany();
  await prisma.customerOrder.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.item.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
}

export async function makeUser(role: Role, assignedLocationId?: string) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash,
      name: `${role} Test User`,
      role,
      assignedLocationId,
    },
  });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, assignedLocationId: user.assignedLocationId },
    env.jwtSecret,
    { expiresIn: "1h" }
  );
  return { user, token };
}

export async function makeLocation(name = `Loc-${Date.now()}-${Math.random()}`) {
  return prisma.location.create({ data: { name } });
}

export async function makeItem() {
  const category = await prisma.category.create({ data: { name: `Cat-${Date.now()}-${Math.random()}` } });
  return prisma.item.create({
    data: { name: "Test Item", sku: `SKU-${Date.now()}-${Math.random()}`, categoryId: category.id },
  });
}

export async function makeBatch(itemId: string, locationId: string, physicalQuantity: number) {
  return prisma.inventoryBatch.create({
    data: { itemId, locationId, batchCode: `B-${Date.now()}-${Math.random()}`, physicalQuantity },
  });
}
