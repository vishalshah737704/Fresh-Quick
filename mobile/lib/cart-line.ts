// Pure cart-line helpers shared by the web and mobile cart stores and by Zippy's action executor.
// mobile/lib/cart-line.ts is a byte-identical copy (tests/zippy-cart-line.test.mjs guards drift).

export function buildLineId(menuItemId: string, selectedOptions: { optionId: string }[]): string {
  const optionIds = selectedOptions.map((o) => o.optionId).sort();
  return `${menuItemId}::${optionIds.join(",")}`;
}

// Equal lineIds add their quantities; new lines are appended. Inputs are never mutated.
export function mergeCartLines<T extends { lineId: string; quantity: number }>(existing: T[], incoming: T[]): T[] {
  const merged = existing.map((line) => ({ ...line }));
  for (const line of incoming) {
    const match = merged.find((m) => m.lineId === line.lineId);
    if (match) match.quantity += line.quantity;
    else merged.push({ ...line });
  }
  return merged;
}
