import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(authenticate);

const nameSchema = z.object({ name: z.string().min(1) });

// --- Locations ---
router.get("/locations", async (_req, res) => {
  const data = await prisma.location.findMany({ orderBy: { name: "asc" } });
  res.json({ data });
});

router.post("/locations", requireRole(Role.ADMIN), async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  const data = await prisma.location.create({ data: { name } });
  res.status(201).json({ data });
});

// --- Categories ---
router.get("/categories", async (_req, res) => {
  const data = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json({ data });
});

router.post("/categories", requireRole(Role.ADMIN), async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  const data = await prisma.category.create({ data: { name } });
  res.status(201).json({ data });
});

// --- Items ---
const itemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  categoryId: z.string().uuid(),
});

router.get("/items", async (_req, res) => {
  const data = await prisma.item.findMany({ include: { category: true }, orderBy: { name: "asc" } });
  res.json({ data });
});

router.post("/items", requireRole(Role.ADMIN, Role.OPERATIONS), async (req, res) => {
  const input = itemSchema.parse(req.body);
  const data = await prisma.item.create({ data: input });
  res.status(201).json({ data });
});

export default router;
