import { Router } from "express";
import { z } from "zod";
import { Role, WorkOrderStatus } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import { createWorkOrder, listWorkOrders, updateWorkOrderStatus } from "./workorders.service";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  locationId: z.string().uuid(),
  itemId: z.string().uuid(),
  requiredQuantity: z.number().int().positive(),
  assignedUserId: z.string().uuid(),
});

const statusSchema = z.object({ status: z.nativeEnum(WorkOrderStatus) });

/**
 * @openapi
 * /work-orders:
 *   get:
 *     summary: List work orders with live shortage calculation
 *     tags: [WorkOrders]
 */
router.get("/", async (_req, res) => {
  const data = await listWorkOrders();
  res.json({ data });
});

/**
 * @openapi
 * /work-orders:
 *   post:
 *     summary: Create a work order (Admin only, per spec)
 *     tags: [WorkOrders]
 */
router.post("/", requireRole(Role.ADMIN), async (req, res) => {
  const input = createSchema.parse(req.body);
  const data = await createWorkOrder(input);
  res.status(201).json({ data });
});

/**
 * @openapi
 * /work-orders/{id}/status:
 *   patch:
 *     summary: Update work order status (Admin, Operations)
 *     tags: [WorkOrders]
 */
router.patch("/:id/status", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const data = await updateWorkOrderStatus(req.params.id, status);
  res.json({ data });
});

export default router;
