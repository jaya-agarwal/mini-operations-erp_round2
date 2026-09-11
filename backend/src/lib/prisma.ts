import { PrismaClient } from "@prisma/client";

// Singleton pattern — avoids exhausting Neon's connection pool with a new
// PrismaClient per hot-reload in dev, and per test-file in the test suite.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
