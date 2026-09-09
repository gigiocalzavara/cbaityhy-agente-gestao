import "server-only";

export function operationalEnv() {
  const url = process.env.CBAITYHY_OPERATIONAL_SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase operacional não configurado.");
  return { url, secret };
}

export function operationalHeaders(extra: Record<string, string> = {}) {
  const { secret } = operationalEnv();
  return {
    apikey: secret,
    ...(secret.startsWith("eyJ") ? { Authorization: `Bearer ${secret}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function operationalFetch(path: string, init: RequestInit = {}) {
  const { url } = operationalEnv();
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...operationalHeaders(),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}
