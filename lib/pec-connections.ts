import "server-only";
import crypto from "node:crypto";
import { Client } from "pg";
import { operationalFetch } from "@/lib/operational-supabase";

export type PecConnectionConfig = {
  municipalityId: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslEnabled: boolean;
};

type StoredConnection = {
  municipality_id: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_encrypted: string;
  ssl_enabled: boolean;
  active: boolean;
  last_test_at?: string | null;
  last_test_status?: "success" | "error" | null;
  last_error?: string | null;
};

function encryptionKey() {
  const raw = process.env.APS_AGENT_DB_CREDENTIALS_KEY;
  if (!raw) throw new Error("APS_AGENT_DB_CREDENTIALS_KEY não configurada.");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("APS_AGENT_DB_CREDENTIALS_KEY deve ter 32 bytes (hex ou base64).");
  return key;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw new Error("Credencial PEC inválida.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64")), decipher.final()]).toString("utf8");
}

export async function getPecConnection(municipalityId: string): Promise<PecConnectionConfig> {
  const response = await operationalFetch(`/rest/v1/aps_agent_municipality_connections?select=*&municipality_id=eq.${encodeURIComponent(municipalityId)}&active=eq.true&limit=1`);
  if (!response.ok) throw new Error(`Falha ao carregar conexão PEC: ${response.status}`);
  const rows = await response.json() as StoredConnection[];
  const row = rows[0];
  if (!row) throw new Error("PEC_NOT_CONFIGURED");
  return {
    municipalityId: row.municipality_id,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    username: row.username,
    password: decryptSecret(row.password_encrypted),
    sslEnabled: row.ssl_enabled,
  };
}

export async function getPecConnectionSummary(municipalityId: string) {
  const response = await operationalFetch(`/rest/v1/aps_agent_municipality_connections?select=municipality_id,host,port,database_name,username,ssl_enabled,active,last_test_at,last_test_status,last_error&municipality_id=eq.${encodeURIComponent(municipalityId)}&limit=1`);
  if (!response.ok) throw new Error(`Falha ao carregar conexão PEC: ${response.status}`);
  const rows = await response.json();
  return rows[0] || null;
}

export async function savePecConnection(input: PecConnectionConfig, passwordChanged = true) {
  let encryptedPassword: string;
  if (passwordChanged) {
    if (!input.password) throw new Error("Senha do PostgreSQL é obrigatória.");
    encryptedPassword = encryptSecret(input.password);
  } else {
    const existing = await operationalFetch(`/rest/v1/aps_agent_municipality_connections?select=password_encrypted&municipality_id=eq.${encodeURIComponent(input.municipalityId)}&limit=1`);
    if (!existing.ok) throw new Error("Falha ao carregar credencial existente.");
    const rows = await existing.json();
    if (!rows[0]?.password_encrypted) throw new Error("Senha do PostgreSQL é obrigatória.");
    encryptedPassword = rows[0].password_encrypted;
  }

  const response = await operationalFetch(`/rest/v1/aps_agent_municipality_connections?on_conflict=municipality_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      municipality_id: input.municipalityId,
      host: input.host,
      port: input.port,
      database_name: input.databaseName,
      username: input.username,
      password_encrypted: encryptedPassword,
      ssl_enabled: input.sslEnabled,
      active: true,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Falha ao salvar conexão PEC: ${response.status} ${await response.text()}`);
}

export async function testPecConnection(config: PecConnectionConfig) {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.databaseName,
    user: config.username,
    password: config.password,
    connectionTimeoutMillis: 7000,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = await client.query("select current_database() as database_name, current_user as username, now() as checked_at");
    await client.query("ROLLBACK");
    return { ok: true, details: result.rows[0] };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function updatePecTestStatus(municipalityId: string, ok: boolean, error?: string) {
  const response = await operationalFetch(`/rest/v1/aps_agent_municipality_connections?municipality_id=eq.${encodeURIComponent(municipalityId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_test_at: new Date().toISOString(),
      last_test_status: ok ? "success" : "error",
      last_error: ok ? null : String(error || "Falha de conexão").slice(0, 500),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("Falha ao registrar teste de conexão PEC.");
}
