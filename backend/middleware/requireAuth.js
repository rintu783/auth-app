import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies.accessToken;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const result = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [payload.id]
    );
    const row = result.rows[0];
    if (!row) {
      res.clearCookie("accessToken");
      return res.status(401).json({ error: "Account no longer exists" });
    }
    req.user = { id: row.id, role: row.role };
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}