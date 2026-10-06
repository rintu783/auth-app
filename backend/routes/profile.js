import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearAuthCookies } from "../utils/tokens.js";

const router = express.Router();

// A fixed, curated set of avatars — the ONLY values users are allowed to choose.
// Each name is a "seed": the same seed always generates the same character image.
const ALLOWED_AVATARS = [
  "Felix", "Aneka", "Milo", "Zoe", "Oscar", "Luna",
  "Leo", "Nova", "Max", "Ruby", "Sam", "Willow",
];

// ---------- PROTECTED ROUTE ----------  GET /api/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, name, age, gender, avatar, created_at FROM users WHERE id = $1",
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

// ---------- CHECK ROLE ----------  GET /api/role
router.get("/role", requireAuth, (req, res) => {
  res.json({ role: req.user.role });
});

// ---------- UPDATE PROFILE (name / age / gender / avatar) ----------  PATCH /api/profile
// PATCH semantics:
//   field missing (undefined) -> leave it unchanged
//   age or gender = null      -> clear it (both columns are nullable)
//   name or avatar            -> can be changed but never cleared
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const { name, age, gender, avatar } = req.body || {};

    if (name === undefined && age === undefined && gender === undefined && avatar === undefined) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    // The name column is VARCHAR(255); without this check a longer name would be a 500.
    if (name !== undefined && name.trim().length > 255) {
      return res.status(400).json({ error: "Name must be 255 characters or fewer" });
    }
    if (age !== undefined && age !== null &&
        (!Number.isInteger(age) || age <= 0 || age >= 150)) {
      return res.status(400).json({ error: "Age must be a whole number between 1 and 149" });
    }
    const allowedGenders = ["male", "female", "other", "prefer_not_to_say"];
    if (gender !== undefined && gender !== null && !allowedGenders.includes(gender)) {
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
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- CHANGE USERNAME ----------  PATCH /api/profile/username
router.patch("/profile/username", requireAuth, async (req, res) => {
  try {
    const { newUsername, currentPassword } = req.body || {};

    if (typeof newUsername !== "string" || typeof currentPassword !== "string") {
      return res.status(400).json({ error: "New username and current password are required" });
    }
    const cleanUsername = newUsername.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
    }

    const result = await pool.query("SELECT password_hash, username FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordOk = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordOk) return res.status(401).json({ error: "Current password is incorrect" });

    if (cleanUsername === user.username) {
      return res.status(400).json({ error: "That is already your username" });
    }

    const updateResult = await pool.query(
      `UPDATE users SET username = $1 WHERE id = $2
       RETURNING id, username, email, role, name, age, gender, avatar, created_at`,
      [cleanUsername, req.user.id]
    );

    res.json({ user: updateResult.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That username is already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- CHANGE PASSWORD — revokes all refresh tokens for this user ----------  PATCH /api/profile/password
router.patch("/profile/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
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

// ---------- DELETE ACCOUNT ----------  DELETE /api/profile
router.delete("/profile", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};

    if (typeof password !== "string" || password.length === 0) {
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

export default router;