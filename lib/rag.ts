import "server-only";

type RagMatch = {
  chunk_id?: string;
  source_id: string;
  content: string;
  similarity?: number;
};

type KnowledgeSource = {
  id: string;
  title: string;
  canonical_url?: string | null;
  storage_path?: string | null;
  visibility?: string | null;
};

function env() {
  const url = process.env.CBAITYHY_AI_SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.CBAITYHY_AI_SUPABASE_SECRET_KEY;
  const defaultOrganizationId = process.env.CBAITYHY_ORGANIZATION_ID || null;
  if (!url || !secret) throw new Error("RAG compartilhado da CBAItyhy não configurado.");
  return { url, secret, defaultOrganizationId };
}

function headers() {
  const { secret } = env();
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function aiRequest<T>(path: string, init: RequestInit = {}) {
  const { url } = env();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...headers(), ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Supabase IA ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function embedQuestion(question: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: [question],
      dimensions: 1536,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.data?.[0]?.embedding as number[];
}

export async function retrieveKnowledge(
  question: string,
  municipalityId?: string | null,
  authenticatedOrganizationId?: string | null,
) {
  const { defaultOrganizationId } = env();
  const organizationId = authenticatedOrganizationId || defaultOrganizationId;
  if (!organizationId) throw new Error("Organização CBAItyhy não definida para o RAG.");
  const embedding = await embedQuestion(question);

  let matches = await aiRequest<RagMatch[]>("rpc/match_knowledge_chunks", {
    method: "POST",
    body: JSON.stringify({
      p_organization_id: organizationId,
      p_municipality_id: municipalityId || null,
      p_query_embedding: embedding,
      p_match_count: 8,
      p_similarity_threshold: 0.45,
    }),
  });

  if (!matches.length) {
    matches = await aiRequest<RagMatch[]>("rpc/match_knowledge_chunks", {
      method: "POST",
      body: JSON.stringify({
        p_organization_id: organizationId,
        p_municipality_id: municipalityId || null,
        p_query_embedding: embedding,
        p_match_count: 12,
        p_similarity_threshold: 0.24,
      }),
    });
  }

  if (!matches.length) return { evidence: "", sources: [] as KnowledgeSource[] };

  const sourceIds = [...new Set(matches.map((item) => item.source_id))];
  const sources = await aiRequest<KnowledgeSource[]>(
    `knowledge_sources?select=id,title,canonical_url,storage_path,visibility&id=in.(${sourceIds.join(",")})&organization_id=eq.${organizationId}`,
  );
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const evidence = matches
    .map((match, index) => `[Fonte ${index + 1}] ${sourceMap.get(match.source_id)?.title || "Conteúdo"}\n${match.content}`)
    .join("\n\n");

  return { evidence, sources };
}
