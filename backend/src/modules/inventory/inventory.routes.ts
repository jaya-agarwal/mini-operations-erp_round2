import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import { createInventoryBatch, listInventory, markStockDamaged } from "./inventory.service";

const router = Router();
router.use(authenticate);

const createBatchSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  batchCode: z.string().min(1),
  physicalQuantity: z.number().int().min(0),
});

const damageSchema = z.object({
  quantity: z.number().int().positive(),
});

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: List inventory batches with derived available quantity
 *     tags: [Inventory]
 */
router.get("/", async (req, res) => {
  const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
  const data = await listInventory({ locationId, itemId });
  res.json({ data });
});

/**
 * @openapi
 * /inventory:
 *   post:
 *     summary: Create/receive a new inventory batch (Admin, Operations)
 *     tags: [Inventory]
 */
router.post("/", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const input = createBatchSchema.parse(req.body);
  const batch = await createInventoryBatch({ ...input, createdById: req.user!.id });
  res.status(201).json({ data: batch });
});

/**
 * @openapi
 * /inventory/{batchId}/damage:
 *   post:
 *     summary: Mark a quantity of a batch as damaged (Operations, Admin). Reduces available stock immediately.
 *     tags: [Inventory]
 */
router.post("/:batchId/damage", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const { quantity } = damageSchema.parse(req.body);
  const batch = await markStockDamaged({
    batchId: req.params.batchId,
    quantity,
    createdById: req.user!.id,
  });
  res.json({ data: batch });
});

export default router;
