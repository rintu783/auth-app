import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import "dotenv/config";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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

// ---------- LOGIN (username OR email) ----------
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ error: "Enter your username or email, and your password" });
    }

    // 1. Find the user by username OR email
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [identifier.trim().toLowerCase()]
    );
    const user = result.rows[0];

    // 2. Compare the typed password with the stored hash
    const passwordOk = user && (await bcrypt.compare(password, user.password_hash));

    // Same message whether the user is missing or the password is wrong
    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    // 3. Create the token
    const token = jwt.sign({ id: user.id ,role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    

    res.json({
  token,
  user: {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  },
});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- AUTH MIDDLEWARE ----------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);  // throws if fake or expired
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
  "SELECT id, username, email, role, name, age, gender, created_at FROM users WHERE id = $1",
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
  // role comes straight from the verified JWT payload — no DB call needed
  res.json({ role: req.user.role });
});
// ---------- UPDATE PROFILE ----------
app.patch("/api/profile", requireAuth, async (req, res) => {
  try {
    const { name, age, gender } = req.body || {};

    if (name === undefined && age === undefined && gender === undefined) {
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

    // Build the SET clause dynamically so unsent fields aren't overwritten
    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name.trim()); }
    if (age !== undefined) { fields.push(`age = $${i++}`); values.push(age); }
    if (gender !== undefined) { fields.push(`gender = $${i++}`); values.push(gender); }

    values.push(req.user.id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, username, email, role, name, age, gender, created_at`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// ---------- CHANGE PASSWORD ----------
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

    res.json({ message: "Password updated successfully" });
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

    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
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

app.listen(5000, () => console.log("API running on http://localhost:5000"));