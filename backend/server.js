import express from "express";
import cors from "cors";
import pg from "pg";
import "dotenv/config";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Health check: proves the server AND the database both work
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", error: "Database not reachable" });
  }
});

app.listen(5000, () => console.log("API running on http://localhost:5000"));