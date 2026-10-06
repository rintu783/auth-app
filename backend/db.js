import "dotenv/config"; // load .env before the pool reads DATABASE_URL
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });