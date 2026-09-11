import "server-only";
import { Client, Pool, type QueryResultRow } from "pg";
import { getPecConnection } from "@/lib/pec-connections";
import { openSshForward } from "@/lib/ssh-tunnel";

const pools = new Map<string, Pool>();

async function getPool(municipalityId: string) {
  const cached = pools.get(municipalityId);
  if (cached) return cached;

  const config = await getPecConnection(municipalityId);
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.databaseName,
    user: config.username,
    password: config.password,
    max: Number(process.env.PEC_PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });

  pool.on("error", () => pools.delete(municipalityId));
  pools.set(municipalityId, pool);
  return pool;
}

export async function invalidateMunicipalityPool(municipalityId: string) {
  const pool = pools.get(municipalityId);
  if (!pool) return;
  pools.delete(municipalityId);
  await pool.end().catch(() => undefined);
}

export async function executeReadOnlyQuery<T extends QueryResultRow = Record<string, unknown>>(
  municipalityId: string,
  sql: string,
  values: unknown[] = [],
) {
  const config = await getPecConnection(municipalityId);
  const tunnel = config.sshEnabled ? await openSshForward({ host:config.sshHost, port:config.sshPort, username:config.sshUsername, password:config.sshPassword, hostFingerprint:config.sshHostFingerprint },config.host,config.port) : null;
  const sshClient = tunnel ? new Client({ database:config.databaseName, user:config.username, password:config.password, ssl:config.sslEnabled ? { rejectUnauthorized:false } : false, connectionTimeoutMillis:10_000, stream:()=>tunnel.stream }) : null;
  if (sshClient) {
    try { await sshClient.connect(); }
    catch (error) { await tunnel?.close(); throw error; }
  }
  const pooledClient = sshClient ? null : await (await getPool(municipalityId)).connect();
  const client = sshClient || pooledClient!;
  const timeout = Math.max(1000, Math.min(Number(process.env.PEC_PG_STATEMENT_TIMEOUT_MS || 8000), 15000));

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${timeout}ms'`);
    const result = await client.query<T>(sql, values);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    if (pooledClient) pooledClient.release();
    else await sshClient?.end().catch(() => undefined);
    await tunnel?.close();
  }
}
