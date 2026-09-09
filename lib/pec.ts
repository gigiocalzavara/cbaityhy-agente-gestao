import "server-only";
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool() {
  if (pool) return pool;

  const host = process.env.PEC_PG_HOST;
  const database = process.env.PEC_PG_DATABASE;
  const user = process.env.PEC_PG_USER;
  const password = process.env.PEC_PG_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error("Conexão READ ONLY com o PostgreSQL do PEC não configurada.");
  }

  pool = new Pool({
    host,
    port: Number(process.env.PEC_PG_PORT || 5432),
    database,
    user,
    password,
    max: Number(process.env.PEC_PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: String(process.env.PEC_PG_SSL || "true") === "true" ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

export async function executeReadOnlyQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values: unknown[] = [],
) {
  const client = await getPool().connect();
  const timeout = Math.max(1000, Math.min(Number(process.env.PEC_PG_STATEMENT_TIMEOUT_MS || 8000), 15000));

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${timeout}ms'`);
    const result = await client.query<T>(sql, values);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
