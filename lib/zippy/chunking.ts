import { createHash } from "node:crypto";

export const ZIPPY_SOURCES = ["manual", "faq", "guide", "policy", "menu"] as const;
export const ZIPPY_AUDIENCES = ["all", "customer", "vendor", "delivery", "admin"] as const;
const MAX_CHUNK_CHARS = 1800;

export type BuiltChunk = {
  chunkKey: string;
  source: string;
  audience: string;
  title: string;
  content: string;
  contentHash: string;
};

export function parseFrontMatter(
  path: string,
  text: string
): { meta: { source: string; audience: string; title: string }; body: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error(`${path}: missing front matter (--- block)`);
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = /^(\w+):\s*(.+?)\s*$/.exec(line);
    if (kv) fields[kv[1]] = kv[2];
  }
  const { source, audience, title } = fields;
  if (!source || !(ZIPPY_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`${path}: front matter "source" must be one of ${ZIPPY_SOURCES.join(", ")}`);
  }
  if (!audience || !(ZIPPY_AUDIENCES as readonly string[]).includes(audience)) {
    throw new Error(`${path}: front matter "audience" must be one of ${ZIPPY_AUDIENCES.join(", ")}`);
  }
  if (!title) throw new Error(`${path}: front matter "title" is required`);
  return { meta: { source, audience, title }, body: match[2] };
}

type Section = { heading: string; text: string };

function splitSections(body: string): Section[] {
  const sections: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (heading) sections.push({ heading: heading[1], lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections
    .map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text !== "");
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let current = "";
  for (const para of text.split(/\n{2,}/)) {
    if (current && current.length + para.length + 2 > max) {
      pieces.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current) pieces.push(current);
  return pieces.flatMap((piece) => {
    if (piece.length <= max) return [piece];
    const hard: string[] = [];
    for (let i = 0; i < piece.length; i += max) hard.push(piece.slice(i, i + max));
    return hard;
  });
}

const slug = (heading: string) =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

export function buildChunks(files: { path: string; text: string }[]): BuiltChunk[] {
  const out: BuiltChunk[] = [];
  for (const file of files) {
    const { meta, body } = parseFrontMatter(file.path, file.text);
    const seen = new Map<string, number>();
    for (const section of splitSections(body)) {
      const base = section.heading ? slug(section.heading) : "intro";
      const title = section.heading ? `${meta.title} — ${section.heading}` : meta.title;
      splitLong(section.text, MAX_CHUNK_CHARS).forEach((content) => {
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        const chunkKey = `${file.path}#${count === 1 ? base : `${base}-${count}`}`;
        const contentHash = createHash("sha256")
          .update(`${meta.source}|${meta.audience}|${title}|${content}`)
          .digest("hex");
        out.push({ chunkKey, source: meta.source, audience: meta.audience, title, content, contentHash });
      });
    }
  }
  return out;
}
