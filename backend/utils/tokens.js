import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db.js";

// Single source of truth for the refresh cookie's scope — used everywhere it's
// set OR cleared, and must match the prefix shared by /api/auth/refresh and /api/auth/logout.
export const REFRESH_COOKIE_PATH = "/api/auth";

export function createAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" } // short-lived on purpose
  );
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createRefreshToken(userId) {
  const rawToken = crypto.randomBytes(64).toString("hex"); // sent to the browser
  const tokenHash = hashToken(rawToken); // stored in the database

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

// Used by login (via setAuthCookies) AND by /api/auth/refresh, so the options live in one place.
export function setAccessCookie(res, accessToken) {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
}

export function setAuthCookies(res, accessToken, refreshToken) {
  setAccessCookie(res, accessToken);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH, // matches /api/auth/refresh AND /api/auth/logout
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearAuthCookies(res) {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken", { path: REFRESH_COOKIE_PATH }); // must match exactly
}