import "express-async-errors"; // must be imported before routes are defined
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./docs/swagger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import workOrderRoutes from "./modules/workorders/workorders.routes";
import transferRoutes from "./modules/transfers/transfers.routes";
import orderRoutes from "./modules/orders/orders.routes";
import referenceDataRoutes from "./modules/locations/locations.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use("/api/auth", authRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/work-orders", workOrderRoutes);
  app.use("/api/transfers", transferRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api", referenceDataRoutes); // /api/locations, /api/categories, /api/items
  app.use("/api", dashboardRoutes); // /api/dashboard/stats

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
