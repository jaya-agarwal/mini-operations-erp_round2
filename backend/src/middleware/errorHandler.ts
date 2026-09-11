import { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "ValidationError",
      message: "Request failed validation",
      details: err.flatten(),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.constructor.name,
      message: err.message,
      details: err.details,
    });
  }

  // Prisma unique-constraint violations etc. surface here as generic errors —
  // never leak internals to the client, but log server-side.
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: "InternalServerError",
    message: "Something went wrong",
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "NotFound", message: `No route: ${req.method} ${req.path}` });
}
