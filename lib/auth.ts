import "server-only";
import { cookies } from "next/headers";
import type { AccessRole } from "@/lib/tool-registry";
import { operationalEnv, operationalFetch, operationalHeaders } from "@/lib/operational-supabase";

export type ManagementIdentity = {
  authUserId: string;
  email: string;
  organizationId: string;
  municipalityId: string;
  municipalityName: string;
  municipalityIbgeCode: string;
  role: AccessRole;
  nominalAccess: boolean;
};

type Profile = {
  auth_user_id: string;
  organization_id: string;
  municipality_id: string;
  municipality_name: string;
  role: AccessRole;
  nominal_access: boolean;
  active: boolean;
};

type Municipality = { id: string; organization_id: string; name: string; ibge_code: string; state_code: string; status: string };

async function getBaseIdentity() {
  const store = await cookies();
  const token = store.get("cbai_access_token")?.value;
  if (!token) throw new Error("UNAUTHORIZED");
  const { url, secret } = operationalEnv();
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: secret, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) throw new Error("UNAUTHORIZED");
  const user = await userResponse.json();
  const profileResponse = await operationalFetch(`/rest/v1/aps_agent_profiles?select=auth_user_id,organization_id,municipality_id,municipality_name,role,nominal_access,active&auth_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`);
  if (!profileResponse.ok) throw new Error(`Falha ao carregar perfil: ${profileResponse.status}`);
  const profiles = await profileResponse.json() as Profile[];
  if (!profiles[0]) throw new Error("FORBIDDEN");
  return { user, profile: profiles[0], store };
}

export async function listAccessibleMunicipalities() {
  const { user, profile } = await getBaseIdentity();
  if (profile.role === "admin") {
    const response = await operationalFetch(`/rest/v1/municipalities?select=id,organization_id,name,ibge_code,state_code,status&organization_id=eq.${encodeURIComponent(profile.organization_id)}&status=eq.active&deleted_at=is.null&order=name.asc`);
    if (!response.ok) throw new Error("Falha ao listar municípios.");
    return { user, profile, municipalities: await response.json() as Municipality[] };
  }
  const linksResponse = await operationalFetch(`/rest/v1/aps_agent_user_municipalities?select=municipality_id&auth_user_id=eq.${encodeURIComponent(user.id)}&active=eq.true`);
  if (!linksResponse.ok) throw new Error("Falha ao listar vínculos municipais.");
  const links = await linksResponse.json() as { municipality_id: string }[];
  const ids = Array.from(new Set([profile.municipality_id, ...links.map((item) => item.municipality_id)])).filter(Boolean);
  if (!ids.length) return { user, profile, municipalities: [] as Municipality[] };
  const response = await operationalFetch(`/rest/v1/municipalities?select=id,organization_id,name,ibge_code,state_code,status&id=in.(${ids.join(",")})&status=eq.active&deleted_at=is.null&order=name.asc`);
  if (!response.ok) throw new Error("Falha ao listar municípios.");
  return { user, profile, municipalities: await response.json() as Municipality[] };
}

export async function requireManagementIdentity(): Promise<ManagementIdentity> {
  const { user, profile, municipalities } = await listAccessibleMunicipalities();
  if (!municipalities.length) throw new Error("FORBIDDEN");
  const store = await cookies();
  const selectedId = store.get("cbai_municipality_id")?.value;
  const municipality = municipalities.find((item) => item.id === selectedId)
    || municipalities.find((item) => item.id === profile.municipality_id)
    || municipalities[0];
  return {
    authUserId: user.id,
    email: user.email || "",
    organizationId: profile.organization_id,
    municipalityId: municipality.id,
    municipalityName: municipality.name,
    municipalityIbgeCode: municipality.ibge_code,
    role: profile.role,
    nominalAccess: Boolean(profile.nominal_access),
  };
}

export async function signInWithPassword(email: string, password: string) {
  const { url, secret } = operationalEnv();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { ...operationalHeaders(), apikey: secret },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("INVALID_LOGIN");
  return response.json() as Promise<{ access_token: string; expires_in?: number }>;
}
