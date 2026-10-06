import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import adminRoutes from "./routes/admin.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env");
  process.exit(1);
}

const app = express();

// ---------- GLOBAL MIDDLEWARE (must come before the routers that need it) ----------
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true, // required so the browser sends/receives cookies cross-origin
}));
app.use(express.json());
app.use(cookieParser()); // must run before any route reads req.cookies

// ---------- ROUTES ----------
app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", profileRoutes);
app.use("/api", adminRoutes);

app.listen(5000, () => console.log("API running on http://localhost:5000"));