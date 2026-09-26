import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import "dotenv/config";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env");
  process.exit(1);
}
// A fixed, curated set of avatars — the ONLY values users are allowed to choose.
// Each name is a "seed": the same seed always generates the same character image.
const ALLOWED_AVATARS = [
  "Felix", "Aneka", "Milo", "Zoe", "Oscar", "Luna",
  "Leo", "Nova", "Max", "Ruby", "Sam", "Willow",
];
const app = express();


// ---------- GLOBAL MIDDLEWARE (must come before any route that needs it) ----------
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true, // required so the browser sends/receives cookies cross-origin
}));
app.use(express.json());
app.use(cookieParser()); // must run before any route reads req.cookies

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ---------- TOKEN HELPERS ----------
function createAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" } // short-lived on purpose
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userId) {
  const rawToken = crypto.randomBytes(64).toString("hex"); // sent to the browser
  const tokenHash = hashToken(rawToken); // stored in the database

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/refresh", // only ever sent back on this one endpoint
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearAuthCookies(res) {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken", { path: "/api/refresh" });
}

// ---------- HEALTH CHECK ----------
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: "error", error: "Database not reachable" });
  }
});

// ---------- REGISTER ----------
app.post("/api/register", async (req, res) => {
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

// ---------- LOGIN (username OR email) — now issues cookies, not a JSON token ----------
app.post("/api/login", async (req, res) => {
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

// ---------- AUTH MIDDLEWARE ----------
function requireAuth(req, res, next) {
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
}

// ---------- PROTECTED ROUTE ----------
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, name, age, gender,avatar, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- CHECK ROLE ----------
app.get("/api/role", requireAuth, (req, res) => {
  res.json({ role: req.user.role });
});

// ---------- UPDATE PROFILE ----------
app.patch("/api/profile", requireAuth, async (req, res) => {
  try {
    const { name, age, gender, avatar } = req.body || {};

    if (name === undefined && age === undefined && gender === undefined && avatar === undefined) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (age !== undefined && (!Number.isInteger(age) || age <= 0 || age >= 150)) {
      return res.status(400).json({ error: "Age must be a whole number between 1 and 149" });
    }
    const allowedGenders = ["male", "female", "other", "prefer_not_to_say"];
    if (gender !== undefined && !allowedGenders.includes(gender)) {
      return res.status(400).json({ error: "Invalid gender value" });
    }
    if (avatar !== undefined && !ALLOWED_AVATARS.includes(avatar)) {
      return res.status(400).json({ error: "Invalid avatar selection" });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined)   { fields.push(`name = $${i++}`);   values.push(name.trim()); }
    if (age !== undefined)    { fields.push(`age = $${i++}`);    values.push(age); }
    if (gender !== undefined) { fields.push(`gender = $${i++}`); values.push(gender); }
    if (avatar !== undefined) { fields.push(`avatar = $${i++}`); values.push(avatar); }

    values.push(req.user.id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, username, email, role, name, age, gender, avatar, created_at`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- CHANGE PASSWORD — now revokes all refresh tokens for this user ----------
app.patch("/api/profile/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentOk = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentOk) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user.id]);

    // Revoke every existing refresh token for this user — forces re-login everywhere
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [req.user.id]);
    clearAuthCookies(res);

    res.json({ message: "Password updated successfully. Please log in again." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- DELETE ACCOUNT ----------
app.delete("/api/profile", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ error: "Password is required to delete your account" });
    }

    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Deleting the user row also deletes their refresh_tokens rows automatically
    // (ON DELETE CASCADE on refresh_tokens.user_id) — no extra query needed here.
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);

    clearAuthCookies(res);
    res.json({ message: "Account deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- ADMIN: LIST ALL USERS ----------
app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- REFRESH ACCESS TOKEN ----------
app.post("/api/refresh", async (req, res) => {
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

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.json({ message: "Access token refreshed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- LOGOUT ----------
app.post("/api/logout", async (req, res) => {
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

app.listen(5000, () => console.log("API running on http://localhost:5000"));