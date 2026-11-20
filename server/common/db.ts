import pg from "pg";

/** Each process creates one pool and passes it to repositories; only entry points own its lifetime. */
export function createDb(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1500, query_timeout: 5000 });
  pool.on("error", () => console.error("postgres connection unavailable"));
  return pool;
}
