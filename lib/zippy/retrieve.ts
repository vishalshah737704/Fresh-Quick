import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { audiencesFor, type ZippyRole } from "./audience";
import { embedTexts } from "./openai-embed";
import type { Match } from "./prompt";

export async function retrieveChunks(question: string, role: ZippyRole | null): Promise<Match[]> {
  const [embedding] = await embedTexts([question]);
  const { data, error } = await supabaseServer.rpc("match_zippy_chunks", {
    query_embedding: embedding,
    caller_audiences: audiencesFor(role),
    match_count: 8,
  });
  if (error) throw new Error(`match_zippy_chunks failed: ${error.message}`);
  return (data ?? []) as Match[];
}
