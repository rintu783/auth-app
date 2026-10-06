import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
} from "../utils/tokens.js";

const router = express.Router();

// ---------- REGISTER ----------  POST /api/register
router.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body || {};

    if (!email || !username || !password) {
      return res.status(400).json({ error: "Email, username and password are required" });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, role, created_at`,
      [email.trim().toLowerCase(), username.trim().toLowerCase(), passwordHash]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- LOGIN (username OR email) — issues cookies, not a JSON token ----------  POST /api/login
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ error: "Enter your username or email, and your password" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [identifier.trim().toLowerCase()]
    );
    const user = result.rows[0];

    const passwordOk = user && (await bcrypt.compare(password, user.password_hash));
    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name,
        age: user.age,
        gender: user.gender,
        avatar: user.avatar,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- REFRESH ACCESS TOKEN ----------  POST /api/auth/refresh
router.post("/auth/refresh", async (req, res) => {
  try {
    const rawToken = req.cookies.refreshToken;
    if (!rawToken) {
      return res.status(401).json({ error: "No refresh token" });
    }

    const tokenHash = hashToken(rawToken);

    const result = await pool.query(
      `SELECT rt.user_id, rt.expires_at, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];

    if (!row || new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: "Refresh token invalid or expired" });
    }

    const newAccessToken = createAccessToken({ id: row.user_id, role: row.role });
    setAccessCookie(res, newAccessToken);

    res.json({ message: "Access token refreshed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- LOGOUT ----------  POST /api/auth/logout
router.post("/auth/logout", async (req, res) => {
  try {
    const rawToken = req.cookies.refreshToken;
    if (rawToken) {
      await pool.query("DELETE FROM refresh_tokens WHERE token_hash = $1", [hashToken(rawToken)]);
    }
    clearAuthCookies(res);
    res.json({ message: "Logged out" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;