import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import { createTransferRequest, dispatchTransfer, listTransfers, receiveTransfer } from "./transfers.service";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  sourceBatchId: z.string().uuid(),
});

const dispatchSchema = z.object({ sourceBatchId: z.string().uuid() });

const receiveSchema = z.object({
  destinationBatchCode: z.string().min(1),
  // Omit to receive everything remaining; include for Live Verification
  // "Change 2" (partial receipt).
  quantity: z.number().int().positive().optional(),
});

/**
 * @openapi
 * /transfers:
 *   get:
 *     summary: List internal stock transfers
 *     tags: [Transfers]
 */
router.get("/", async (_req, res) => {
  const data = await listTransfers();
  res.json({ data });
});

/**
 * @openapi
 * /transfers:
 *   post:
 *     summary: Request an internal transfer (Operations, Admin)
 *     tags: [Transfers]
 */
router.post("/", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const input = createSchema.parse(req.body);
  const data = await createTransferRequest(input);
  res.status(201).json({ data });
});

/**
 * @openapi
 * /transfers/{id}/dispatch:
 *   post:
 *     summary: Dispatch a transfer — reduces source inventory (Operations, Admin)
 *     tags: [Transfers]
 */
router.post("/:id/dispatch", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const { sourceBatchId } = dispatchSchema.parse(req.body);
  const data = await dispatchTransfer(req.params.id, sourceBatchId, req.user!.id);
  res.json({ data });
});

/**
 * @openapi
 * /transfers/{id}/receive:
 *   post:
 *     summary: Receive a transfer (fully or partially) — increases destination inventory (Operations, Admin)
 *     tags: [Transfers]
 */
router.post("/:id/receive", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const { destinationBatchCode, quantity } = receiveSchema.parse(req.body);
  const data = await receiveTransfer(req.params.id, destinationBatchCode, req.user!.id, quantity);
  res.json({ data });
});

export default router;
