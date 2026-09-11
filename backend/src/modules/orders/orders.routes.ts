import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import { cancelCustomerOrder, createCustomerOrder, listCustomerOrders } from "./orders.service";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  customerName: z.string().min(1),
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  batchId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: List customer orders
 *     tags: [Orders]
 */
router.get("/", async (_req, res) => {
  const data = await listCustomerOrders();
  res.json({ data });
});

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Create a customer order and reserve stock (Sales, Admin). Concurrency-safe.
 *     tags: [Orders]
 */
router.post("/", requireRole(Role.ADMIN, Role.SALES), async (req, res) => {
  const input = createSchema.parse(req.body);
  const data = await createCustomerOrder({ ...input, createdById: req.user!.id });
  res.status(201).json({ data });
});

/**
 * @openapi
 * /orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order and release its reserved inventory (Sales, Admin)
 *     tags: [Orders]
 */
router.post("/:id/cancel", requireRole(Role.ADMIN, Role.SALES), async (req, res) => {
  const data = await cancelCustomerOrder(req.params.id, req.user!.id);
  res.json({ data });
});

export default router;
