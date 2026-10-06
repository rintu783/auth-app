import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /api/health
router.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", error: "Database not reachable" });
  }
});

export default router;