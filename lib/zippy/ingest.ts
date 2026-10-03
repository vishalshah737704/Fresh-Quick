import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase-server";
import { buildChunks } from "./chunking";
import { embedTexts } from "./openai-embed";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

async function readKnowledgeFiles(): Promise<{ path: string; text: string }[]> {
  const entries = await readdir(KNOWLEDGE_DIR, { recursive: true });
  const files = entries
    .map((e) => e.replace(/\\/g, "/"))
    .filter((e) => e.endsWith(".md") && path.basename(e) !== "README.md")
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      path: file,
      text: await readFile(path.join(KNOWLEDGE_DIR, file), "utf8"),
    }))
  );
}

export async function ingestKnowledge(): Promise<{
  total: number;
  embedded: number;
  unchanged: number;
  deleted: number;
}> {
  const files = await readKnowledgeFiles();
  // Guard: an empty folder (bad checkout, wrong cwd) must never wipe the table.
  if (files.length === 0) throw new Error("No knowledge/*.md files found; refusing to ingest");
  const chunks = buildChunks(files);
  if (chunks.length === 0) throw new Error("Knowledge files produced no chunks; refusing to ingest");

  const { data: existing, error: existingError } = await supabaseServer
    .from("zippy_chunks")
    .select("chunk_key, content_hash");
  if (existingError) throw new Error(`Reading zippy_chunks failed: ${existingError.message}`);
  const existingHash = new Map((existing ?? []).map((r) => [r.chunk_key, r.content_hash]));

  const changed = chunks.filter((c) => existingHash.get(c.chunkKey) !== c.contentHash);
  if (changed.length > 0) {
    const vectors = await embedTexts(changed.map((c) => `${c.title}\n${c.content}`));
    const rows = changed.map((c, i) => ({
      chunk_key: c.chunkKey,
      source: c.source,
      audience: c.audience,
      title: c.title,
      content: c.content,
      content_hash: c.contentHash,
      embedding: JSON.stringify(vectors[i]),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseServer.from("zippy_chunks").upsert(rows, { onConflict: "chunk_key" });
    if (error) throw new Error(`Upsert into zippy_chunks failed: ${error.message}`);
  }

  const keep = new Set(chunks.map((c) => c.chunkKey));
  const stale = [...existingHash.keys()].filter((k) => !keep.has(k));
  for (let i = 0; i < stale.length; i += 100) {
    const { error } = await supabaseServer
      .from("zippy_chunks")
      .delete()
      .in("chunk_key", stale.slice(i, i + 100));
    if (error) throw new Error(`Deleting stale chunks failed: ${error.message}`);
  }

  return {
    total: chunks.length,
    embedded: changed.length,
    unchanged: chunks.length - changed.length,
    deleted: stale.length,
  };
}
