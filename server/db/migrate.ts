import type { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDb } from "../common/db";
import { loadDatabaseUrl } from "../common/config";

const directory = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
export async function migrate(pool: Pool, folder = directory): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // Session lock spans the per-file transactions; concurrent startup runners wait here.
    await client.query("SELECT pg_advisory_lock(74829163)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of (await readdir(folder)).filter((n) => /^\d+.*\.sql$/.test(n)).sort()) {
      const found = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (found.rowCount) continue;
      const sql = await readFile(resolve(folder, name), "utf8");
      await client.query("BEGIN");
      try {
        // Migration files are trusted repository SQL, never request/string-built queries.
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT"); applied.push(name);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    return applied;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(74829163)"); }
    finally { client.release(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pool = createDb(loadDatabaseUrl());
  try { console.info("Applied migrations:", await migrate(pool)); }
  catch { console.error("Database migration failed"); process.exitCode = 1; }
  finally { await pool.end(); }
}
