import "server-only";
import { cookies } from "next/headers";
import type { AccessRole } from "@/lib/tool-registry";

export type ManagementIdentity = {
  authUserId: string;
  email: string;
  organizationId: string;
  municipalityId: string;
  municipalityName: string;
  role: AccessRole;
  nominalAccess: boolean;
};

function env() {
  const url = process.env.CBAITYHY_OPERATIONAL_SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.CBAITYHY_OPERATIONAL_SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase operacional não configurado.");
  return { url, secret };
}

function serviceHeaders() {
  const { secret } = env();
  return {
    apikey: secret,
    ...(secret.startsWith("eyJ") ? { Authorization: `Bearer ${secret}` } : {}),
    "Content-Type": "application/json",
  };
}

export async function requireManagementIdentity(): Promise<ManagementIdentity> {
  const store = await cookies();
  const token = store.get("cbai_access_token")?.value;
  if (!token) throw new Error("UNAUTHORIZED");

  const { url, secret } = env();
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: secret, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) throw new Error("UNAUTHORIZED");
  const user = await userResponse.json();

  const profileResponse = await fetch(
    `${url}/rest/v1/aps_agent_profiles?select=auth_user_id,organization_id,municipality_id,municipality_name,role,nominal_access,active&auth_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`,
    { headers: serviceHeaders(), cache: "no-store" },
  );
  if (!profileResponse.ok) throw new Error(`Falha ao carregar perfil: ${profileResponse.status}`);
  const profiles = await profileResponse.json();
  const profile = profiles[0];
  if (!profile) throw new Error("FORBIDDEN");

  return {
    authUserId: user.id,
    email: user.email || "",
    organizationId: profile.organization_id,
    municipalityId: profile.municipality_id,
    municipalityName: profile.municipality_name || "Município",
    role: profile.role as AccessRole,
    nominalAccess: Boolean(profile.nominal_access),
  };
}

export async function signInWithPassword(email: string, password: string) {
  const { url, secret } = env();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: secret, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("INVALID_LOGIN");
  return response.json() as Promise<{ access_token: string; expires_in?: number }>;
}
