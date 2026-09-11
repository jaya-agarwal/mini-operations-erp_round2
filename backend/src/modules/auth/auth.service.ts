import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { UnauthorizedError, ValidationError } from "../../lib/errors";

const SALT_ROUNDS = 10;

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
  assignedLocationId?: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ValidationError("A user with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      assignedLocationId: input.assignedLocationId ?? null,
    },
  });

  return signToken(user);
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError("Invalid email or password");

  return signToken(user);
}

function signToken(user: {
  id: string;
  email: string;
  role: Role;
  name: string;
  assignedLocationId: string | null;
}) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    assignedLocationId: user.assignedLocationId,
  };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}
