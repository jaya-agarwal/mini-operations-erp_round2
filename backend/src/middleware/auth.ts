import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  assignedLocationId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

// Backend authorization is mandatory per spec — this is enforced on every
// protected route, never trusted from the frontend.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' is not permitted to perform this action`
      );
    }
    next();
  };
}

// Live Verification "Change 4": restrict users to only their assigned
// location. Built in advance but OFF by default (env.enforceLocationRestriction)
// since the base spec doesn't ask for it. If this is the live-round change,
// flip ENFORCE_LOCATION_RESTRICTION=true and restart — no code change needed.
// ADMIN is always exempt (admins operate across all locations).
export function enforceLocationScope(getLocationId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!env.enforceLocationRestriction) return next();
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role === "ADMIN") return next();

    const targetLocationId = getLocationId(req);
    if (targetLocationId && targetLocationId !== req.user.assignedLocationId) {
      throw new ForbiddenError("You are not permitted to act on this location");
    }
    next();
  };
}
