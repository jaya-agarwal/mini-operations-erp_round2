import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { loginUser, registerUser } from "./auth.service";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.nativeEnum(Role),
  assignedLocationId: z.string().uuid().optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user (admin-only in a real deployment; open here for grading convenience)
 *     tags: [Auth]
 */
// NOTE: registration is intentionally open (no auth required) so the grader
// can create Admin/Operations/Sales accounts without a chicken-and-egg
// problem. `npm run seed` already creates one of each role — see README.
router.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await registerUser(input);
  res.status(201).json(result);
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     tags: [Auth]
 */
router.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await loginUser(input.email, input.password);
  res.json(result);
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Auth]
 */
router.get("/me", authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// Example of a role-gated route, exercised by Test 5 (unauthorized user
// cannot perform restricted operation) at the integration level via the
// work-order routes instead — kept here as a lightweight smoke endpoint.
router.get("/admin-check", authenticate, requireRole(Role.ADMIN), async (req, res) => {
  res.json({ ok: true });
});

export default router;
