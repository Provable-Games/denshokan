import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/denshokan",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export async function healthCheck(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (e) {
    console.error("[DB Health Check] Failed:", e);
    return false;
  }
}

export async function getLatestIndexedBlock(): Promise<number | null> {
  try {
    const client = await pool.connect();
    // Read from Apibara's internal checkpoint (tracks latest processed block)
    const result = await client.query(
      "SELECT order_key AS latest_block FROM airfoil.checkpoints WHERE id LIKE 'indexer_denshokan%' LIMIT 1"
    );
    client.release();
    const val = result.rows[0]?.latest_block;
    return val != null ? Number(val) : null;
  } catch {
    return null;
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}

export { pool };
