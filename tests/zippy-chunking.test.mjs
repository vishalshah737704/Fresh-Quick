import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter, buildChunks } from "../lib/zippy/chunking.ts";

const doc = (body, meta = "source: manual\naudience: customer\ntitle: Ordering") =>
  `---\n${meta}\n---\n${body}`;

test("parseFrontMatter reads the three fields and returns the body", () => {
  const { meta, body } = parseFrontMatter("a.md", doc("# Ordering\nHello"));
  assert.deepEqual(meta, { source: "manual", audience: "customer", title: "Ordering" });
  assert.equal(body.trim(), "# Ordering\nHello");
});

test("parseFrontMatter rejects missing, unknown and malformed metadata, naming the file", () => {
  assert.throws(() => parseFrontMatter("x.md", "no front matter"), /x\.md/);
  assert.throws(() => parseFrontMatter("x.md", doc("b", "source: manual\ntitle: T")), /audience/);
  assert.throws(
    () => parseFrontMatter("x.md", doc("b", "source: blog\naudience: all\ntitle: T")),
    /source/
  );
  assert.throws(
    () => parseFrontMatter("x.md", doc("b", "source: manual\naudience: root\ntitle: T")),
    /audience/
  );
});

test("buildChunks splits on ## and ### headings with stable keys and titles", () => {
  const text = doc(
    "# Ordering\nIntro text.\n\n## Place an order\nPick a store.\n\n### Track an order\nOpen Orders.\n"
  );
  const chunks = buildChunks([{ path: "a.md", text }]);
  assert.deepEqual(chunks.map((c) => c.title), [
    "Ordering",
    "Ordering — Place an order",
    "Ordering — Track an order",
  ]);
  assert.deepEqual(chunks.map((c) => c.chunkKey), [
    "a.md#intro",
    "a.md#place-an-order",
    "a.md#track-an-order",
  ]);
  assert.ok(chunks.every((c) => c.audience === "customer" && c.source === "manual"));
  assert.ok(chunks[1].content.includes("Pick a store."));
});

test("duplicate headings get unique keys", () => {
  const text = doc("## Help\nA\n\n## Help\nB\n");
  const keys = buildChunks([{ path: "a.md", text }]).map((c) => c.chunkKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("long sections are split under the size cap and empty sections are skipped", () => {
  const para = "word ".repeat(100).trim();
  const text = doc(`## Big\n${Array(12).fill(para).join("\n\n")}\n\n## Empty\n\n## Next\nx\n`);
  const chunks = buildChunks([{ path: "a.md", text }]);
  assert.ok(chunks.filter((c) => c.title.endsWith("Big")).length > 1);
  assert.ok(chunks.every((c) => c.content.length <= 1800));
  assert.ok(!chunks.some((c) => c.title.endsWith("Empty")));
});

test("content hash is stable, and changes with content or audience", () => {
  const a = buildChunks([{ path: "a.md", text: doc("## S\nsame") }])[0];
  const b = buildChunks([{ path: "a.md", text: doc("## S\nsame") }])[0];
  const c = buildChunks([{ path: "a.md", text: doc("## S\nchanged") }])[0];
  const d = buildChunks([
    { path: "a.md", text: doc("## S\nsame", "source: manual\naudience: vendor\ntitle: Ordering") },
  ])[0];
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
  assert.notEqual(a.contentHash, d.contentHash);
});

test("CRLF files chunk the same as LF files", () => {
  const lf = doc("## S\nline one\nline two\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.deepEqual(
    buildChunks([{ path: "a.md", text: crlf }]).map((c) => c.contentHash),
    buildChunks([{ path: "a.md", text: lf }]).map((c) => c.contentHash)
  );
});
