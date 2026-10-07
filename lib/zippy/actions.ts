import type Anthropic from "@anthropic-ai/sdk";
import type { Parsed } from "./catalog";
import type { ActionCard, CartLineData, CartOption, CartSnapshot } from "./action-types";

// Pure on purpose (no value imports from sibling modules: node's test runner could not resolve them), so the helpers
// it needs are injected. LIMITS duplicates the shared client constants; a test asserts they are equal.
export type ActionShapeDeps = {
  sanitize(value: unknown, max?: number): string;
  toPaise(value: number | string): number;
  formatRupees(paise: number): string;
  newId(): string;
};

export const NO_CART_VISIBLE_ERROR = "I can't see your cart on this page; the customer can open the customer area (or the mobile app) and ask again";
// Duplicates MAX_SNAPSHOT_LINES in action-types.ts (a test asserts they are equal).
const SNAPSHOT_LINE_LIMIT = 50;

export const LIMITS = { maxLineQuantity: 20, maxCardsPerReply: 3, maxOptionIds: 20, maxNoteChars: 200, maxLineIdChars: 38 + 37 * 20, maxDescriptionChars: 900, maxListedReorderItems: 5, maxListedSkipped: 3, maxNoteShown: 60, maxOrderNoteChars: 500, maxCurrentNoteShown: 80, maxNameChars: 80 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asObject = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

const isQuantity = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= LIMITS.maxLineQuantity;

export type ProposeAddInput = { product_id: string; quantity: number; option_ids: string[]; note: string | undefined };

export function parseProposeAddInput(raw: unknown): Parsed<ProposeAddInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.product_id !== "string" || !UUID.test(o.product_id)) {
    return { ok: false, error: "product_id must be a dish id from an earlier result" };
  }
  let quantity = 1;
  if (o.quantity !== undefined && o.quantity !== null) {
    if (!isQuantity(o.quantity, 1)) return { ok: false, error: `quantity must be a whole number from 1 to ${LIMITS.maxLineQuantity}` };
    quantity = o.quantity;
  }
  let optionIds: string[] = [];
  if (o.option_ids !== undefined && o.option_ids !== null) {
    if (!Array.isArray(o.option_ids) || o.option_ids.length > LIMITS.maxOptionIds || !o.option_ids.every((id) => typeof id === "string" && UUID.test(id))) {
      return { ok: false, error: "option_ids must be a list of option ids" };
    }
    optionIds = [...new Set((o.option_ids as string[]).map((id) => id.toLowerCase()))];
  }
  let note: string | undefined;
  if (o.note !== undefined && o.note !== null) {
    if (typeof o.note !== "string" || o.note.trim().length > LIMITS.maxNoteChars) return { ok: false, error: "note is too long" };
    note = o.note.trim() === "" ? undefined : o.note.trim();
  }
  return { ok: true, value: { product_id: o.product_id.toLowerCase(), quantity, option_ids: optionIds, note } };
}

// A malformed id says "not found", the same text a missing or foreign order gets, so ids cannot be probed.
export function parseProposeReorderInput(raw: unknown): Parsed<{ order_id: string }> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  const id = typeof o.order_id === "string" ? o.order_id.trim() : "";
  if (id.toLowerCase() === "latest") return { ok: true, value: { order_id: "latest" } };
  if (!UUID.test(id)) return { ok: false, error: "not found" };
  return { ok: true, value: { order_id: id.toLowerCase() } };
}

export function parseProposeCartChangeInput(raw: unknown): Parsed<{ line_id: string; quantity: number }> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.line_id !== "string" || o.line_id === "" || o.line_id.length > LIMITS.maxLineIdChars) {
    return { ok: false, error: "line_id must be a cart line id from get_my_cart" };
  }
  if (!isQuantity(o.quantity, 0)) return { ok: false, error: `quantity must be a whole number from 0 to ${LIMITS.maxLineQuantity}` };
  return { ok: true, value: { line_id: o.line_id, quantity: o.quantity } };
}

export function parseProposeOrderNoteInput(raw: unknown): Parsed<{ text: string }> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.text !== "string") return { ok: false, error: "text must be a string (empty to clear the note)" };
  if (o.text.length > LIMITS.maxOrderNoteChars * 4) return { ok: false, error: `text is too long; an order note is at most ${LIMITS.maxOrderNoteChars} characters` };
  return { ok: true, value: { text: o.text } };
}

export function parseProposeClearInput(raw: unknown): Parsed<Record<string, never>> {
  return asObject(raw) ? { ok: true, value: {} } : { ok: false, error: "input must be an object" };
}

export type ProductForCart = {
  id: string;
  name: string;
  price: number | string;
  imageUrl: string | null;
  isAvailable: boolean;
  storeId: string;
  storeName: string;
  storeOpen: boolean;
  storeSuspended: boolean;
  groups: { id: string; name: string; minSelect: number; maxSelect: number; options: { id: string; name: string; priceDeltaPaise: number }[] }[];
};

export function selectOptions(
  groups: ProductForCart["groups"],
  optionIds: string[],
  clean: (value: string) => string = (v) => v
): { ok: true; selected: CartOption[] } | { ok: false; error: string } {
  const unique = [...new Set(optionIds)];
  const selected: CartOption[] = [];
  const counts = new Map<string, number>();
  for (const optionId of unique) {
    const group = groups.find((g) => g.options.some((option) => option.id === optionId));
    const option = group?.options.find((candidate) => candidate.id === optionId);
    if (!group || !option) return { ok: false, error: "One of the options is not an option of this dish" };
    counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
    selected.push({ groupId: group.id, groupName: clean(group.name), optionId: option.id, optionName: clean(option.name), priceDeltaPaise: option.priceDeltaPaise });
  }
  for (const group of groups) {
    const count = counts.get(group.id) ?? 0;
    if (count < group.minSelect) return { ok: false, error: `Choose at least ${group.minSelect} for "${clean(group.name)}"` };
    if (count > group.maxSelect) return { ok: false, error: `Choose at most ${group.maxSelect} for "${clean(group.name)}"` };
  }
  // Keep a stable order: by group position.
  selected.sort((a, b) => groups.findIndex((g) => g.id === a.groupId) - groups.findIndex((g) => g.id === b.groupId));
  return { ok: true, selected };
}

const unitPaise = (product: ProductForCart, options: CartOption[], deps: ActionShapeDeps) =>
  deps.toPaise(product.price) + options.reduce((sum, option) => sum + option.priceDeltaPaise, 0);

// Each chosen option with its extra price (integer paise, formatted by the injected formatter) when it is not zero.
const optionLabel = (option: CartOption, deps: Pick<ActionShapeDeps, "formatRupees">) => {
  const delta = option.priceDeltaPaise;
  const price = delta === 0 || !Number.isInteger(delta) ? "" : ` (${delta > 0 ? "+" : ""}${deps.formatRupees(delta)})`;
  return `${option.groupName}: ${option.optionName}${price}`;
};
const optionText = (options: CartOption[], deps: Pick<ActionShapeDeps, "formatRupees">) =>
  options.length > 0 ? ` (${options.map((option) => optionLabel(option, deps)).join(", ")})` : "";

// Only well-formed dish ids are ever sent to the database.
export const uuidsOnly = (ids: string[]): string[] => ids.filter((id) => typeof id === "string" && UUID.test(id));

// The same checks the app's store pages make: a closed or suspended store cannot be ordered from.
function storeProblem(product: ProductForCart, cleanStoreName: string): string | null {
  if (product.storeSuspended) return "not found";
  if (!product.storeOpen) return `${cleanStoreName} is closed right now`;
  return null;
}

// Adding from a different store than the cart replaces the cart on Confirm (spec), so the card must say so.
export function replaceNotice(cart: CartSnapshot | null | undefined, cardStoreId: string, deps: Pick<ActionShapeDeps, "sanitize">): string {
  if (!cart || cart.items.length === 0 || cart.storeId === null || cart.storeId === cardStoreId) return "";
  const count = cart.items.reduce((sum, line) => sum + line.quantity, 0);
  const current = cart.storeName === null ? "" : deps.sanitize(cart.storeName, LIMITS.maxNameChars);
  return `. Confirming replaces the ${count} ${count === 1 ? "item" : "items"}${current === "" ? "" : ` from ${current}`} in your cart.`;
}

// What the card assumed about the cart: the store of the (non-empty) snapshot, checked again at tap time.
export const cartStoreIdOf = (cart: CartSnapshot | null | undefined): string | null =>
  cart && cart.items.length > 0 ? cart.storeId : null;

const noteText = (note: string, max: number) => ` (note: "${note.replace(/"/g, "'").slice(0, max)}")`;

export function buildAddItemCard(
  args: { product: ProductForCart; quantity: number; optionIds: string[]; note: string | undefined; cart?: CartSnapshot | null },
  deps: ActionShapeDeps
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  const { product, quantity, optionIds, note } = args;
  const storeName = deps.sanitize(product.storeName, LIMITS.maxNameChars);
  const problem = storeProblem(product, storeName);
  if (problem) return { ok: false, error: problem };
  if (!product.isAvailable) return { ok: false, error: `${deps.sanitize(product.name, LIMITS.maxNameChars)} is unavailable right now` };
  const chosen = selectOptions(product.groups, optionIds, (v) => deps.sanitize(v, LIMITS.maxNameChars));
  if (!chosen.ok) return { ok: false, error: chosen.error };
  const name = deps.sanitize(product.name, LIMITS.maxNameChars);
  const cleanNote = note === undefined ? "" : deps.sanitize(note, LIMITS.maxNoteChars);
  const item: CartLineData = {
    menuItemId: product.id,
    name,
    price: Number(product.price),
    quantity,
    imageUrl: product.imageUrl,
    selectedOptions: chosen.selected,
    specialInstructions: cleanNote === "" ? null : cleanNote,
  };
  const totalPaise = unitPaise(product, chosen.selected, deps) * quantity;
  const addText = (options: string) =>
    `Add ${quantity} × ${name}${options} from ${storeName}, ${deps.formatRupees(totalPaise)}${cleanNote === "" ? "" : `; note: "${cleanNote.replace(/"/g, "'")}"`}${replaceNotice(args.cart, product.storeId, deps)}`;
  // Many long option names can push the text past the cap; then say how many options instead of listing them.
  const full = addText(optionText(chosen.selected, deps));
  const description = full.length > LIMITS.maxDescriptionChars ? addText(` (${chosen.selected.length} options)`) : full;
  return {
    ok: true,
    card: {
      kind: "add_item",
      id: deps.newId(),
      title: "Add to cart",
      description,
      storeId: product.storeId,
      cartStoreId: cartStoreIdOf(args.cart),
      storeName,
      item,
    },
  };
}

export type ReorderSource = {
  order_id: string;
  store_id: string;
  lines: { product_id: string; quantity: number; note: string | null; option_ids: (string | null)[] }[];
};

export function buildReorderLines(
  source: ReorderSource,
  products: Map<string, ProductForCart>,
  deps: ActionShapeDeps
): { ok: true; items: CartLineData[]; skipped: { name: string; reason: string }[]; storeName: string; totalPaise: number } | { ok: false; error: string } {
  const items: CartLineData[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let storeName: string | null = null;
  let totalPaise = 0;
  for (const line of source.lines) {
    const product = products.get(line.product_id);
    if (!product || product.storeId !== source.store_id) {
      skipped.push({ name: "An item", reason: "no longer on the menu" });
      continue;
    }
    const cleanStoreName = deps.sanitize(product.storeName, LIMITS.maxNameChars);
    const problem = storeProblem(product, cleanStoreName);
    if (problem) return { ok: false, error: problem };
    storeName = cleanStoreName;
    const name = deps.sanitize(product.name, LIMITS.maxNameChars);
    if (!product.isAvailable) {
      skipped.push({ name, reason: "unavailable now" });
      continue;
    }
    if (line.option_ids.some((id) => id === null)) {
      skipped.push({ name, reason: "options changed" });
      continue;
    }
    const chosen = selectOptions(product.groups, line.option_ids as string[], (v) => deps.sanitize(v, LIMITS.maxNameChars));
    if (!chosen.ok) {
      skipped.push({ name, reason: "options changed" });
      continue;
    }
    if (!Number.isFinite(line.quantity)) {
      skipped.push({ name, reason: "quantity unreadable" });
      continue;
    }
    if (!Number.isFinite(Number(product.price)) || chosen.selected.some((option) => !Number.isInteger(option.priceDeltaPaise))) {
      skipped.push({ name, reason: "price unavailable" });
      continue;
    }
    const quantity = Math.min(LIMITS.maxLineQuantity, Math.max(1, Math.trunc(line.quantity)));
    const note = line.note === null ? "" : deps.sanitize(line.note, LIMITS.maxNoteChars);
    items.push({
      menuItemId: product.id,
      name,
      price: Number(product.price),
      quantity,
      imageUrl: product.imageUrl,
      selectedOptions: chosen.selected,
      specialInstructions: note === "" ? null : note,
    });
    totalPaise += unitPaise(product, chosen.selected, deps) * quantity;
  }
  if (items.length === 0 || storeName === null) return { ok: false, error: "None of the items can be reordered right now" };
  return { ok: true, items, skipped, storeName, totalPaise };
}

export function buildReorderCard(
  source: ReorderSource,
  products: Map<string, ProductForCart>,
  deps: ActionShapeDeps,
  cart?: CartSnapshot | null
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  const built = buildReorderLines(source, products, deps);
  if (!built.ok) return built;
  const { items, skipped, storeName, totalPaise } = built;
  const count = items.length;
  const itemText = (line: CartLineData) =>
    `${line.quantity} × ${line.name}${optionText(line.selectedOptions, deps)}${line.specialInstructions === null ? "" : noteText(line.specialInstructions, LIMITS.maxNoteShown)}`;
  // Long skipped lists are capped too, so the description cap holds however many lines were skipped.
  const skippedText = (shown: number) => {
    if (skipped.length === 0) return "";
    if (shown === 0) return `; skipped ${skipped.length} ${skipped.length === 1 ? "item" : "items"}`;
    const names = skipped.slice(0, shown).map((s) => `${s.name} (${s.reason})`).join(", ");
    const more = skipped.length - shown;
    return `; skipped ${names}${more > 0 ? ` and ${more} more` : ""}`;
  };
  const describe = (listed: number, shownSkipped: number) => {
    const more = count - listed;
    const list = listed === 0 ? "items not listed to fit" : items.slice(0, listed).map(itemText).join(", ") + (more > 0 ? ` and ${more} more` : "");
    return `Add ${count} ${count === 1 ? "item" : "items"} from ${storeName}: ${list}, ${deps.formatRupees(totalPaise)}${skippedText(shownSkipped)}${replaceNotice(cart, source.store_id, deps)}`;
  };
  let listed = Math.min(count, LIMITS.maxListedReorderItems);
  let shownSkipped = Math.min(skipped.length, LIMITS.maxListedSkipped);
  while (listed > 0 && describe(listed, shownSkipped).length > LIMITS.maxDescriptionChars) listed -= 1;
  while (shownSkipped > 0 && describe(listed, shownSkipped).length > LIMITS.maxDescriptionChars) shownSkipped -= 1;
  return {
    ok: true,
    card: {
      kind: "reorder",
      id: deps.newId(),
      title: "Reorder",
      description: describe(listed, shownSkipped),
      storeId: source.store_id,
      cartStoreId: cartStoreIdOf(cart),
      storeName,
      items,
      skipped,
    },
  };
}

export function buildCartChangeCard(
  snapshot: CartSnapshot | null,
  input: { line_id: string; quantity: number },
  deps: ActionShapeDeps
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  if (!snapshot || snapshot.items.length === 0) return { ok: false, error: "The cart is empty" };
  const line = snapshot.items.find((candidate) => candidate.lineId === input.line_id);
  if (!line) return { ok: false, error: "not found" };
  const name = deps.sanitize(line.name, LIMITS.maxNameChars);
  if (input.quantity === 0) {
    return { ok: true, card: { kind: "remove_line", id: deps.newId(), title: "Remove from cart", description: `Remove ${name} from your cart`, lineId: line.lineId } };
  }
  return {
    ok: true,
    card: {
      kind: "update_quantity",
      id: deps.newId(),
      title: "Change quantity",
      description: `Change ${name} from ${line.quantity} to ${input.quantity}`,
      lineId: line.lineId,
      quantity: input.quantity,
    },
  };
}

export function buildClearCartCard(
  snapshot: CartSnapshot | null,
  deps: ActionShapeDeps
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  if (!snapshot || snapshot.items.length === 0) return { ok: false, error: "The cart is empty" };
  const count = snapshot.items.length;
  return {
    ok: true,
    card: { kind: "clear_cart", id: deps.newId(), title: "Clear cart", description: `Remove all ${count} ${count === 1 ? "line" : "lines"} from your cart` },
  };
}

const quoted = (text: string) => `"${text}"`;
// Order note only: C1 controls, zero-width and bidi override/isolate characters are invisible on the card but would be saved.
const INVISIBLE_NOTE_CHARS = /[\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
// Double quotes become single quotes in the saved text itself, so the card's quoted string is exactly what Confirm saves.
const noteSafe = (text: string) => text.replace(/"/g, "'");

// The card shows the cleaned text in quotes: exactly what Confirm saves. A note longer than the limit after cleaning is
// refused (never cut), so what the customer approves is what the model wrote.
export function buildOrderNoteCard(
  snapshot: CartSnapshot | null,
  input: { text: string },
  deps: ActionShapeDeps
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  if (!snapshot) return { ok: false, error: NO_CART_VISIBLE_ERROR };
  if (snapshot.items.length === 0 || snapshot.storeId === null) return { ok: false, error: "The cart is empty" };
  // The cap passed to sanitize is above any possible length, so it never truncates; the limit is checked below.
  const noLimit = LIMITS.maxOrderNoteChars * 4 + 1;
  const cleaned = noteSafe(deps.sanitize(input.text.replace(INVISIBLE_NOTE_CHARS, ""), noLimit));
  if (cleaned.length > LIMITS.maxOrderNoteChars) {
    return { ok: false, error: `The note is longer than ${LIMITS.maxOrderNoteChars} characters: ask the customer to shorten it` };
  }
  const rawCurrent = (snapshot.orderNote ?? "").slice(0, LIMITS.maxOrderNoteChars);
  const current = noteSafe(deps.sanitize(rawCurrent.replace(INVISIBLE_NOTE_CHARS, ""), LIMITS.maxOrderNoteChars));
  const currentShown = current.length > LIMITS.maxCurrentNoteShown ? `${current.slice(0, LIMITS.maxCurrentNoteShown - 1)}…` : current;
  let description: string;
  if (cleaned === "") {
    description = current === "" ? "Clear your order note" : `Clear your order note (${quoted(currentShown)})`;
  } else if (current === "") {
    description = `Set your order note to: ${quoted(cleaned)}`;
  } else {
    description = `Replace your order note ${quoted(currentShown)} with: ${quoted(cleaned)}`;
  }
  return {
    ok: true,
    card: { kind: "set_order_note", id: deps.newId(), title: cleaned === "" ? "Clear order note" : "Order note", description, text: cleaned, cartStoreId: cartStoreIdOf(snapshot), expectedNote: rawCurrent },
  };
}

// A cart lineId is `<menuItemId>::<sorted option ids>` (lib/cart-line.ts buildLineId); this is its inverse for the id part.
export const menuItemIdOfLine = (lineId: string): string => lineId.split("::")[0].toLowerCase();

// The dish ids a checkout card must re-check live. Anything that is not a uuid is left out (it can never be found).
export function cartDishIds(cart: CartSnapshot | null | undefined): string[] {
  if (!cart) return [];
  return [...new Set(cart.items.map((line) => menuItemIdOfLine(line.lineId)).filter((id) => UUID.test(id)))];
}

// Opens the checkout page for the cart as it is now; the customer enters their own details and pays there.
export function buildCheckoutCard(
  cart: CartSnapshot | null | undefined,
  products: Map<string, ProductForCart>,
  deps: ActionShapeDeps
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  if (!cart) return { ok: false, error: NO_CART_VISIBLE_ERROR };
  if (cart.items.length === 0 || cart.storeId === null) return { ok: false, error: "The cart is empty" };
  let storeName: string | null = null;
  for (const line of cart.items) {
    const product = products.get(menuItemIdOfLine(line.lineId));
    const lineName = deps.sanitize(line.name, LIMITS.maxNameChars);
    if (!product || product.storeId !== cart.storeId) return { ok: false, error: `${lineName === "" ? "An item" : lineName} is no longer available` };
    const cleanStoreName = deps.sanitize(product.storeName, LIMITS.maxNameChars);
    const problem = storeProblem(product, cleanStoreName);
    if (problem) return { ok: false, error: problem };
    if (!product.isAvailable) return { ok: false, error: `${deps.sanitize(product.name, LIMITS.maxNameChars)} is unavailable right now` };
    storeName = cleanStoreName;
  }
  if (storeName === null) return { ok: false, error: "The cart is empty" };
  const itemCount = cart.items.reduce((sum, line) => sum + line.quantity, 0);
  // validate.ts clamps each line to 20 and keeps 50 lines, so a snapshot at either limit may under-count the real cart.
  const countUncertain = cart.items.length >= SNAPSHOT_LINE_LIMIT || cart.items.some((line) => line.quantity >= LIMITS.maxLineQuantity);
  const forCart = countUncertain ? "your cart" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  return {
    ok: true,
    card: {
      kind: "go_to_checkout",
      id: deps.newId(),
      title: "Go to checkout",
      description: `Open checkout for ${forCart} from ${storeName}. You enter your details and pay yourself; Zippy does not place the order.`,
      storeId: cart.storeId,
      storeName,
      itemCount,
    },
  };
}

// A checkout card reads the cart as it is NOW, so it must never share a reply with cart cards that are still waiting.
export const CHECKOUT_AFTER_CART_ERROR = "Cart cards are still waiting for the customer. Ask the customer to confirm the cart cards first, then offer checkout.";
export const CART_AFTER_CHECKOUT_ERROR = "A checkout card is already prepared in this reply, so do not change the cart in the same reply; the customer can ask again after checkout.";
export const cartCardPrepared = (actions: ActionCard[]): boolean => actions.some((card) => card.kind !== "go_to_checkout");
export const checkoutConflict = (actions: ActionCard[]): string | null => (cartCardPrepared(actions) ? CHECKOUT_AFTER_CART_ERROR : null);
export const ORDER_NOTE_TWICE_ERROR = "An order note card is already prepared in this reply; the cart has one note, so send only the final text";
export const orderNoteConflict = (actions: ActionCard[], card: ActionCard): string | null =>
  card.kind === "set_order_note" && actions.some((existing) => existing.kind === "set_order_note") ? ORDER_NOTE_TWICE_ERROR : null;
export const cartChangeConflict = (actions: ActionCard[]): string | null => (checkoutAlreadyPrepared(actions) ? CART_AFTER_CHECKOUT_ERROR : null);

// Checked and pushed with no await in between: tool calls of one round run concurrently, so a second checkout card must be refused at push time.
export const checkoutAlreadyPrepared = (actions: ActionCard[]): boolean => actions.some((card) => card.kind === "go_to_checkout");

// The checkout card has a "Go to checkout" button, not Confirm; the model must not tell the customer to confirm it.
export const proposalStatus = (card: ActionCard): string =>
  card.kind === "go_to_checkout" ? 'waiting for the customer to tap the "Go to checkout" button on the card' : "waiting for the customer to tap Confirm";

export function shapeCartForModel(snapshot: CartSnapshot | null, deps: Pick<ActionShapeDeps, "sanitize" | "toPaise" | "formatRupees">) {
  if (!snapshot || snapshot.items.length === 0) return { store: null, lines: [], empty: true };
  return {
    store: snapshot.storeName === null ? null : deps.sanitize(snapshot.storeName, LIMITS.maxNameChars),
    lines: snapshot.items.map((line) => ({
      line_id: line.lineId,
      name: deps.sanitize(line.name, LIMITS.maxNameChars),
      quantity: line.quantity,
      unit_price: deps.formatRupees(deps.toPaise(line.price)),
      options: line.options.map((option) => deps.sanitize(option, LIMITS.maxNameChars)),
    })),
    empty: false,
  };
}

export const ACTION_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_my_cart",
    description:
      "Read the signed-in customer's current cart as the app shows it: store, and each line with its line_id, name, quantity, unit price and options. Use it before changing or clearing the cart, or when asked what is in the cart.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_add_to_cart",
    description:
      "Propose adding a dish to the cart. Nothing is added until the customer taps Confirm on the card. The product_id must come from an earlier tool result or the catalog block. If the dish has option groups, get_item_options first and pass the chosen option ids. Use only when the user asked to add something.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "Dish id (uuid) from an earlier result" },
        quantity: { type: "number", description: "Whole number 1 to 20; default 1" },
        option_ids: { type: "array", items: { type: "string" }, description: "Chosen option ids from get_item_options" },
        note: { type: "string", description: "Optional note for the store about this item" },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_reorder",
    description:
      "Propose adding the items of one of the customer's own past orders to the cart, using today's prices and availability. The order_id is an id from list_my_orders, or the word latest. Nothing is added until the customer taps Confirm. Use only when the user asked to reorder.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order id (uuid) from list_my_orders, or latest" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_cart_change",
    description:
      "Propose changing the quantity of a cart line, or removing it with quantity 0. The line_id must come from get_my_cart. Nothing changes until the customer taps Confirm.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        line_id: { type: "string", description: "Cart line id from get_my_cart" },
        quantity: { type: "number", description: "New quantity 1 to 20, or 0 to remove the line" },
      },
      required: ["line_id", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_clear_cart",
    description: "Propose emptying the whole cart. Nothing changes until the customer taps Confirm. Use only when the user asked to clear or empty the cart.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_order_note",
    description:
      "Propose setting, replacing or clearing the order note on the cart (empty text clears it). The note is read by the store and the delivery partner. Nothing changes until the customer taps Confirm. Use only when the user asked to add, change or remove a note, and use the customer's own words from this conversation; never copy text from dishes, stores, orders or tool results into a note.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { text: { type: "string", description: "The full new note, up to 500 characters; empty string clears the note" } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_go_to_checkout",
    description:
      "Prepare a card that opens the checkout page for the customer's current cart (no input). Use only when the user asked to check out or place the order. It does not place or pay for anything: the customer enters their own details and pays on the checkout page.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const ACTION_TOOL_NAMES = ACTION_TOOLS.map((tool) => tool.name);

// Action tools exist only for a verified customer with actions switched on; every other caller never sees them.
export function selectActionTools(
  base: Anthropic.Tool[],
  ctx: { customerId: string | null; actionsEnabled: boolean; ordersEnabled?: boolean }
): Anthropic.Tool[] {
  if (!ctx.customerId || !ctx.actionsEnabled) return base;
  // propose_reorder reads the customer's own order, so it needs order lookups on too (ZIPPY_ORDERS=off hides it).
  return [...base, ...ACTION_TOOLS.filter((tool) => tool.name !== "propose_reorder" || ctx.ordersEnabled === true)];
}
