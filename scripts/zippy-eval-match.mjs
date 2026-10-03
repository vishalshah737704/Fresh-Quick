// Pure matching rule for one eval case; keep MIN in sync with the runner.
export function caseOk(c, matches, catalog, min) {
  const usable = matches.filter((m) => m.similarity >= min).slice(0, 3);
  // Production selectContext keeps up to 5 matches, so isolation checks look at 5; positives stay strict at 3.
  const usable5 = matches.filter((m) => m.similarity >= min).slice(0, 5);
  if (c.expectCatalogIncludes) {
    const needle = c.expectCatalogIncludes.toLowerCase();
    return (catalog ?? []).filter((h) => h.similarity >= min).slice(0, 5)
      .some((h) => String(h.content).toLowerCase().includes(needle));
  }
  if (c.expectTitleExcludes) return !usable5.some((m) => m.title.includes(c.expectTitleExcludes));
  if (c.expectTitleIncludes === null) return usable.length === 0;
  return usable.some((m) => m.title.includes(c.expectTitleIncludes));
}
