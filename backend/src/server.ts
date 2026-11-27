import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import { authMiddleware } from "./middleware/auth.js";
import authRouter from "./routes/auth.routes.js";
import bookingsRouter from "./routes/bookings.routes.js";
import reservationsRouter from "./routes/reservations.routes.js";
import roomsRouter from "./routes/rooms.routes.js";
import housekeepingRouter from "./routes/housekeeping.routes.js";
import maintenanceRouter from "./routes/maintenance.routes.js";
import staffRouter from "./routes/staff.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import { startExpiryCron } from "./lib/expiry-cron.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Hotel Management System Backend API",
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/housekeeping", housekeepingRouter);
app.use("/api/maintenance", maintenanceRouter);
app.use("/api/staff", staffRouter);
app.use("/api/dashboard", dashboardRouter);

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  HOTEL MANAGEMENT BACKEND API SERVER RUNNING       `);
  console.log(`  URL: http://localhost:${PORT}                      `);
  console.log(`  CORS Origin: ${FRONTEND_URL}                     `);
  console.log(`====================================================`);

  // Start cron jobs
  startExpiryCron();
});

export default app;
