import "server-only";

const MODEL = process.env.ZIPPY_EMBEDDING_MODEL ?? "text-embedding-3-small";
const BATCH = 64;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, input: texts.slice(i, i + BATCH) }),
    });
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
        if (bodyText.length > 500) bodyText = bodyText.slice(0, 500);
      } catch {
        // ignore if we can't read the body
      }
      throw new Error(`OpenAI embeddings request failed (${res.status}): ${bodyText}`);
    }
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const ordered = [...json.data].sort((a, b) => a.index - b.index);
    for (const row of ordered) vectors.push(row.embedding);
  }
  if (vectors.length !== texts.length) throw new Error("OpenAI returned a wrong number of embeddings");
  return vectors;
}
