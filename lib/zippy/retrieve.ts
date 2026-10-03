import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { audiencesFor, type ZippyRole } from "./audience";
import { embedTexts } from "./openai-embed";
import type { Match } from "./prompt";
import { matchCatalog } from "./tools";
import type { CatalogHit } from "./catalog-data";

export async function embedQuestion(question: string): Promise<number[]> {
  const [embedding] = await embedTexts([question]);
  if (!embedding) throw new Error("embedTexts returned no embedding");
  return embedding;
}

export async function retrieveChunks(embedding: number[], role: ZippyRole | null): Promise<Match[]> {
  const { data, error } = await supabaseServer.rpc("match_zippy_chunks", {
    query_embedding: embedding,
    caller_audiences: audiencesFor(role),
    match_count: 8,
  });
  if (error) throw new Error(`match_zippy_chunks failed: ${error.message}`);
  return (data ?? []) as Match[];
}

export async function retrieveCatalogHits(embedding: number[]): Promise<CatalogHit[]> {
  const hits = await matchCatalog(embedding, 5);
  return hits.map((h) => ({ kind: h.kind, ref_id: h.ref_id }));
}
