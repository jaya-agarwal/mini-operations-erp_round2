import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { getDashboardStats } from "./dashboard.service";

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /dashboard/stats:
 *   get:
 *     summary: Aggregate KPIs, low-stock alerts, and recent inventory-ledger activity
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard snapshot
 */
router.get("/dashboard/stats", async (_req, res) => {
  const data = await getDashboardStats();
  res.json({ data });
});

export default router;
