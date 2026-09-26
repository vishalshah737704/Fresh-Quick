# Restaurant Menu Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every one of the 17 existing restaurants reaches 50+ menu items
(existing items kept, never deleted), by appending new, cuisine-appropriate,
whole-app-unique dish rows to `supabase/seed.sql`.

**Architecture:** Pure `supabase/seed.sql` addition per restaurant —
`insert into public.products (...) values (...) on conflict do nothing`
blocks referencing each restaurant's existing `store_id`. No schema change,
no new vendor accounts (all 17 already have owners). A shared append-only
registry file tracks every item name used so far, so this sub-project (and
the three that follow it) never collides on a name anywhere in the app.

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs` for new dish photos.

**Spec:** `docs/superpowers/specs/2026-09-26-restaurant-menu-expansion-design.md`

## Global Constraints

- Existing menu items are NEVER modified, deleted, or reordered — this
  plan is pure appends (order_items FK integrity for historical orders).
- Every new item name must be unique across the ENTIRE app, not just this
  restaurant or this plan — checked against
  `docs/superpowers/plans/item-name-registry.md` before it is written, and
  appended to that file in the same commit as the SQL that introduces it.
- Zero schema/migration changes.
- Prices in rupees, realistic for each dish.
- Each restaurant's product count must reach 50+ (existing + new
  combined), verified live via `count(p.id) ... where store_id = ...`.
- Reuse the existing Pexels-fetch-once pattern (fetch once, bake URLs into
  seed.sql — never called at runtime).

## Review Focus

- A new item name that collides with the registry as it stood before this
  task's own commit (the registry is the authority, not eyeballing).
- Any diff that touches an existing (already-committed) product row
  instead of only adding new ones.
- A restaurant's final live count falling short of 50.
- Dish names/descriptions implausible for the restaurant's own
  `cuisine_tags` (e.g. a Thai restaurant suddenly selling tacos).
- The registry file itself losing an earlier restaurant's entries (it is
  append-only — a task must never overwrite lines another task added).

---

## Task 0: Create the item-name registry, seeded with all existing items

**Files:**
- Create: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Produces: a plain-text, one-name-per-line, append-only file every later
  task (in this plan and the 3 that follow it) reads before writing new
  names, and appends its own new names to.

- [ ] **Step 1: Seed the registry with every item name currently in the database**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -t -A -c "select p.name from public.products p order by p.name;" > /tmp/all-existing-items.txt
```

- [ ] **Step 2: Write the registry file**

Create `docs/superpowers/plans/item-name-registry.md` with a header and
one existing item name per line (deduplicate exact-string repeats — e.g.
"Veg Fried Rice" appears twice pre-existing, keep it once in the
registry):

```markdown
# Item Name Registry

Append-only. One name per line. Every new product row added anywhere in
the app (any sub-project of the 50-unique-items-per-store redesign) must
use a name not already listed here, and must add its own new names before
its commit.

<one line per existing name, from /tmp/all-existing-items.txt, deduped>
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/item-name-registry.md
git commit -m "docs: seed item-name registry with existing product names"
```

---

## Task 1: Bangkok Bites — Thai (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: Task 0's registry file (read before writing any new name).
- Produces: appends its 47 new names to the registry for later tasks.

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "tom yum soup" "thai red curry" "pad see ew noodles" "thai satay skewers" \
  "mango sticky rice" "thai basil chicken" "thai fried rice" "papaya salad" \
  "thai fish cakes" "thai iced tea"
```
Reuse/adapt URLs across similar dishes where a fresh query isn't needed for every single item — matches the established pattern from prior content phases.

- [ ] **Step 2: Read the registry, then add these 47 new products to `supabase/seed.sql`**

Find Bangkok Bites' existing `store_id` in `supabase/seed.sql` (search for
`Bangkok Bites`) and append new `insert into public.products` rows
referencing it, `on conflict do nothing`, following the exact column
shape used by its 3 existing rows.

| Item | Price | Category | Description |
|---|---|---|---|
| Tom Yum Soup | 180 | Soup | Hot and sour Thai soup with lemongrass |
| Tom Kha Gai | 190 | Soup | Coconut chicken soup with galangal |
| Thai Red Curry | 220 | Curry | Red curry with coconut milk and vegetables |
| Thai Yellow Curry | 220 | Curry | Mild yellow curry with potatoes |
| Massaman Curry | 240 | Curry | Rich peanut-based Thai curry |
| Panang Curry | 230 | Curry | Thick Panang curry with kaffir lime |
| Basil Chicken Stir-Fry | 210 | Main | Stir-fried chicken with Thai basil |
| Cashew Chicken Thai Style | 220 | Main | Chicken and cashews in savory sauce |
| Thai Fried Rice | 180 | Rice | Wok-fried rice with egg and vegetables |
| Pineapple Fried Rice | 200 | Rice | Fried rice served in a pineapple boat |
| Som Tam Papaya Salad | 150 | Salad | Spicy shredded green papaya salad |
| Larb Gai | 190 | Salad | Minced chicken salad with herbs and lime |
| Satay Chicken Skewers | 170 | Appetizer | Grilled chicken skewers with peanut sauce |
| Thai Fish Cakes | 160 | Appetizer | Fried fish cakes with cucumber relish |
| Crispy Spring Rolls Veg | 130 | Appetizer | Fried vegetable spring rolls |
| Thai Basil Pork | 210 | Main | Stir-fried pork with basil and chili |
| Drunken Noodles | 200 | Noodles | Wide rice noodles with basil and chili |
| Thai Omelette | 120 | Appetizer | Crispy Thai-style omelette |
| Mango Sticky Rice | 150 | Dessert | Sweet sticky rice with fresh mango |
| Thai Iced Tea | 90 | Beverage | Sweetened Thai tea with milk |
| Coconut Milk Soup | 170 | Soup | Creamy coconut soup with vegetables |
| Grilled Thai Chicken | 220 | Main | Marinated grilled chicken thigh |
| Thai Beef Salad | 210 | Salad | Grilled beef salad with lime dressing |
| Steamed Jasmine Rice | 70 | Rice | Plain steamed jasmine rice |
| Thai Chili Prawns | 260 | Main | Prawns stir-fried in chili sauce |
| Sweet and Sour Chicken Thai | 210 | Main | Thai-style sweet and sour chicken |
| Thai Spicy Basil Fried Rice | 200 | Rice | Fried rice with chili and basil |
| Vegetable Tempura Thai Style | 160 | Appetizer | Battered fried mixed vegetables |
| Thai Cucumber Salad | 110 | Salad | Cucumber salad with peanuts and chili |
| Chicken Satay with Peanut Sauce | 180 | Appetizer | Grilled chicken skewers, peanut dip |
| Thai Coconut Soup Veg | 160 | Soup | Vegetarian coconut galangal soup |
| Bangkok Street Noodles | 190 | Noodles | Stir-fried noodles, street-food style |
| Thai Lemongrass Chicken | 220 | Main | Chicken marinated in lemongrass |
| Crab Fried Rice Thai | 260 | Rice | Fried rice with crab meat |
| Thai Pumpkin Curry | 200 | Curry | Curry with pumpkin and coconut milk |
| Stir-Fried Morning Glory | 140 | Side | Water spinach stir-fried with garlic |
| Thai Roti Canai | 110 | Side | Flaky fried flatbread |
| Thai Coconut Ice Cream | 130 | Dessert | Coconut milk ice cream with peanuts |
| Thai Iced Coffee | 100 | Beverage | Strong Thai coffee with condensed milk |
| Thai Green Papaya Rolls | 140 | Appetizer | Fresh rolls with papaya and herbs |
| Thai Chicken Wings | 190 | Appetizer | Deep-fried marinated chicken wings |
| Spicy Thai Eggplant | 170 | Side | Stir-fried eggplant with chili basil |
| Thai Vegetable Curry | 190 | Curry | Mixed vegetable curry, coconut base |
| Thai Grilled Pork Skewers | 200 | Appetizer | Marinated grilled pork skewers |
| Thai Shrimp Cakes | 180 | Appetizer | Fried shrimp cakes with chili sauce |
| Thai Mango Salad | 160 | Salad | Green mango salad with dried shrimp |
| Thai Sticky Rice with Mango | 160 | Dessert | Sticky rice, mango, coconut cream |

Verify each name against the registry before writing the SQL; none of the
above collides with the seeded existing-items list as of Task 0.

- [ ] **Step 3: Append these 47 names to the registry**

Add each item name above as a new line to
`docs/superpowers/plans/item-name-registry.md`.

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Bangkok Bites';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Bangkok Bites menu to 50 items"
```

---

## Task 2: Golden Dragon — Chinese (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 1.
- Produces: appends its 47 new names.

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "kung pao chicken chinese" "sweet and sour pork" "chinese dumplings" \
  "hot and sour soup" "chinese fried rice" "chicken manchurian" \
  "chinese noodles bowl" "dim sum platter" "chinese chicken wings" "wonton soup"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

Append to `supabase/seed.sql` under Golden Dragon's existing `store_id`.

| Item | Price | Category | Description |
|---|---|---|---|
| Szechuan Chicken | 220 | Main | Spicy Szechuan-style chicken stir-fry |
| Sweet and Sour Pork | 230 | Main | Crispy pork in sweet and sour sauce |
| Chinese Fried Rice | 170 | Rice | Wok-fried rice with egg and scallion |
| Chilli Paneer | 200 | Main | Cottage cheese tossed in chilli sauce |
| Manchow Soup | 130 | Soup | Spicy vegetable soup with crispy noodles |
| Hot and Sour Soup | 130 | Soup | Tangy soup with tofu and vegetables |
| Chinese Egg Fried Rice | 170 | Rice | Fried rice with scrambled egg |
| Chicken Manchurian | 210 | Main | Fried chicken in tangy Manchurian sauce |
| Schezwan Noodles | 190 | Noodles | Spicy Szechuan-style stir-fried noodles |
| Dragon Chicken | 230 | Main | Crispy chicken in spicy Dragon sauce |
| Honey Chilli Potato | 160 | Appetizer | Crispy potato fingers in honey chilli glaze |
| Chinese Vegetable Soup | 120 | Soup | Clear vegetable soup, Chinese style |
| Crispy Chilli Beef | 250 | Main | Crispy fried beef in chilli sauce |
| Cantonese Fried Rice | 180 | Rice | Fried rice with shrimp and char siu |
| Chicken Lollipop | 210 | Appetizer | Fried frenched chicken wings, spicy glaze |
| Sesame Chicken | 220 | Main | Crispy chicken tossed in sesame sauce |
| Chinese Garlic Prawns | 260 | Main | Prawns stir-fried in garlic sauce |
| Mapo Tofu | 190 | Main | Spicy tofu in fermented bean sauce |
| Dim Sum Platter | 240 | Appetizer | Assorted steamed dim sum |
| Steamed Chicken Dumplings | 180 | Appetizer | Steamed chicken-filled dumplings |
| Vegetable Dumplings | 160 | Appetizer | Steamed vegetable-filled dumplings |
| Chinese Broccoli Stir-Fry | 150 | Side | Broccoli stir-fried in garlic sauce |
| Peking Style Chicken | 230 | Main | Crispy chicken, Peking-style glaze |
| Chinese Egg Drop Soup | 120 | Soup | Silky egg drop soup |
| Black Bean Chicken | 220 | Main | Chicken stir-fried in black bean sauce |
| Chinese Style Fried Fish | 240 | Main | Crispy fried fish, Chinese seasoning |
| Wonton Soup | 150 | Soup | Pork wontons in clear broth |
| Chinese Chicken Salad | 190 | Salad | Shredded chicken salad, sesame dressing |
| Crispy Corn Chinese Style | 150 | Appetizer | Crispy fried corn kernels, spicy |
| Chinese Baby Corn Manchurian | 180 | Appetizer | Fried baby corn in Manchurian sauce |
| Chinese Noodle Soup | 160 | Soup | Noodles in savory Chinese broth |
| Chicken Chowmein | 190 | Noodles | Stir-fried noodles with chicken |
| Chinese Garlic Chicken | 220 | Main | Chicken stir-fried in garlic sauce |
| Dragon Prawns | 260 | Main | Crispy prawns in spicy Dragon glaze |
| Chinese Style Fried Rice Egg | 170 | Rice | Egg fried rice, Chinese seasoning |
| Chilli Garlic Noodles | 180 | Noodles | Noodles tossed in chilli garlic sauce |
| Chinese Cabbage Stir-Fry | 140 | Side | Cabbage stir-fried with garlic |
| Sichuan Tofu | 180 | Main | Spicy Sichuan-style tofu |
| Golden Fried Chicken Chinese Style | 220 | Main | Crispy fried chicken, Chinese spices |
| Chinese Style Mushroom Soup | 130 | Soup | Mushroom soup, Chinese seasoning |
| Kung Pao Prawns | 250 | Main | Prawns stir-fried with peanuts, chilli |
| Chinese Style Sweet Corn Soup | 120 | Soup | Sweet corn soup with egg drop |
| Chinese Vegetable Fried Noodles | 170 | Noodles | Stir-fried noodles with mixed vegetables |
| Golden Dragon Special Fried Rice | 210 | Rice | House-special mixed fried rice |
| Chinese Style Chicken Skewers | 190 | Appetizer | Grilled chicken skewers, soy glaze |
| Chinese Almond Chicken | 220 | Main | Chicken stir-fry topped with almonds |
| Chinese Lemon Chicken | 220 | Main | Crispy chicken in tangy lemon sauce |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Golden Dragon';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Golden Dragon menu to 50 items"
```

---

## Task 3: Wok This Way — Chinese (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 2 (includes Golden Dragon's
  Chinese-dish names — this task's names use "Wok"-branded phrasing to
  avoid collision by construction, but still verify against the registry).
- Produces: appends its 48 new names.

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "wok noodles" "chilli chicken wok" "wok fried rice" "chinese momos" \
  "ginger beef stir fry" "garlic fried rice" "chinese dumplings steamed" \
  "sichuan fried rice" "mongolian chicken" "spring rolls crispy"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Wok Tossed Noodles | 180 | Noodles | Stir-fried noodles, wok-tossed style |
| Wok Fried Chicken | 210 | Main | Crispy wok-fried chicken pieces |
| Wok Style Fried Rice Special | 190 | Rice | House-special wok fried rice |
| Wok Chilli Chicken | 220 | Main | Chicken tossed in chilli garlic sauce |
| Wok Vegetable Stir-Fry | 150 | Side | Mixed vegetables stir-fried in wok |
| Wok Garlic Fried Rice | 170 | Rice | Fried rice with roasted garlic |
| Wok Ginger Beef | 250 | Main | Beef stir-fried with ginger and scallion |
| Wok Style Hakka Noodles | 180 | Noodles | Hakka-style stir-fried noodles |
| Wok Prawn Stir-Fry | 250 | Main | Prawns stir-fried with vegetables |
| Wok Baby Corn Chilli | 170 | Appetizer | Crispy baby corn in chilli sauce |
| Wok Paneer Manchurian | 200 | Main | Paneer in tangy Manchurian sauce |
| Wok Soya Chilli | 170 | Appetizer | Soya chunks tossed in chilli sauce |
| Wok Egg Noodles | 170 | Noodles | Stir-fried noodles with scrambled egg |
| Wok Special Chowmein | 190 | Noodles | House-special chowmein |
| Wok Style Fried Momos | 170 | Appetizer | Deep-fried vegetable momos |
| Wok Vegetable Momos | 150 | Appetizer | Steamed vegetable momos |
| Wok Chicken Momos | 170 | Appetizer | Steamed chicken momos |
| Wok Style Chilli Paneer | 200 | Main | Paneer cubes in spicy chilli sauce |
| Wok Tofu Stir-Fry | 180 | Main | Tofu stir-fried with vegetables |
| Wok Steamed Rice | 70 | Rice | Plain steamed rice |
| Wok Spicy Garlic Prawns | 260 | Main | Prawns in spicy garlic sauce |
| Wok Crispy Chilli Mushroom | 180 | Appetizer | Crispy mushrooms in chilli sauce |
| Wok Cabbage Manchurian | 170 | Main | Cabbage dumplings in Manchurian sauce |
| Wok Style Egg Fried Rice | 170 | Rice | Egg fried rice, wok style |
| Wok Schezwan Fried Rice | 190 | Rice | Spicy Schezwan fried rice |
| Wok Vegetable Manchurian | 180 | Main | Mixed vegetable balls in Manchurian sauce |
| Wok Chicken 65 Chinese Style | 220 | Appetizer | Spicy fried chicken, Chinese seasoning |
| Wok Sesame Tofu | 180 | Main | Tofu tossed in sesame sauce |
| Wok Lotus Stem Chilli | 190 | Appetizer | Crispy lotus stem in chilli sauce |
| Wok Special Noodle Soup | 160 | Soup | Noodle soup with vegetables |
| Wok Chicken Manchurian Dry | 220 | Main | Dry-style chicken Manchurian |
| Wok Garlic Chicken Wings | 210 | Appetizer | Chicken wings in garlic sauce |
| Wok Steamed Dumplings | 170 | Appetizer | Assorted steamed dumplings |
| Wok Style Spring Rolls Crispy | 140 | Appetizer | Crispy vegetable spring rolls |
| Wok Paneer Chilli Dry | 200 | Main | Dry-style chilli paneer |
| Wok Style Chicken Lollipop Spicy | 220 | Appetizer | Spicy fried chicken lollipops |
| Wok Broccoli Garlic Stir-Fry | 160 | Side | Broccoli stir-fried with garlic |
| Wok Sweet Chilli Fish | 250 | Main | Fish in sweet chilli glaze |
| Wok Vegetable Clear Soup | 120 | Soup | Light clear vegetable soup |
| Wok Corn and Capsicum Rice | 170 | Rice | Fried rice with corn and capsicum |
| Wok Style Fried Chicken Wings | 210 | Appetizer | Crispy fried chicken wings |
| Wok Sichuan Fried Rice | 190 | Rice | Spicy Sichuan-style fried rice |
| Wok Style Sweet Corn Chicken Soup | 140 | Soup | Sweet corn soup with shredded chicken |
| Wok Mixed Vegetable Fried Rice | 170 | Rice | Fried rice with mixed vegetables |
| Wok Style Mongolian Chicken | 230 | Main | Chicken in sweet-spicy Mongolian sauce |
| Wok Chilli Fish Dry | 240 | Main | Dry-style chilli fish |
| Wok Style Chicken Fried Rice Special | 200 | Rice | Special chicken fried rice |
| Wok Crispy Vegetable Noodles | 180 | Noodles | Crispy fried noodles with vegetables |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Wok This Way';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Wok This Way menu to 50 items"
```

---

## Task 4: Bella Italia — Italian (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "italian pizza pepperoni" "spaghetti carbonara" "risotto mushroom" \
  "bruschetta tomato" "caprese salad" "italian ravioli" "gnocchi pesto" \
  "tiramisu dessert" "panna cotta" "italian meatballs"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Pepperoni Pizza | 300 | Pizza | Classic pepperoni pizza |
| Quattro Formaggi Pizza | 320 | Pizza | Four-cheese pizza |
| Pasta Arrabbiata | 220 | Pasta | Penne in spicy tomato sauce |
| Spaghetti Carbonara | 250 | Pasta | Spaghetti with egg, pancetta, pecorino |
| Penne Pesto | 230 | Pasta | Penne tossed in basil pesto |
| Lasagna Bolognese | 270 | Pasta | Layered pasta with meat ragu |
| Risotto Mushroom | 260 | Main | Creamy mushroom risotto |
| Bruschetta al Pomodoro | 140 | Appetizer | Toasted bread with tomato and basil |
| Caprese Salad | 160 | Salad | Tomato, mozzarella, and basil salad |
| Minestrone Soup | 150 | Soup | Vegetable and bean soup |
| Fettuccine Alfredo Chicken | 260 | Pasta | Fettuccine in creamy sauce with chicken |
| Ravioli Spinach Ricotta | 250 | Pasta | Ravioli filled with spinach and ricotta |
| Gnocchi al Pesto | 230 | Pasta | Potato gnocchi in pesto sauce |
| Calzone Classico | 260 | Pizza | Folded pizza with cheese and ham |
| Prosciutto Pizza | 310 | Pizza | Pizza topped with prosciutto and arugula |
| Vegetarian Supreme Pizza | 290 | Pizza | Pizza with assorted vegetables |
| Chicken Parmigiana | 280 | Main | Breaded chicken with marinara and cheese |
| Eggplant Parmigiana | 240 | Main | Layered eggplant with marinara and cheese |
| Panzanella Salad | 150 | Salad | Tuscan bread and tomato salad |
| Focaccia Bread | 120 | Side | Herb-topped Italian flatbread |
| Spaghetti Aglio e Olio | 200 | Pasta | Spaghetti with garlic and olive oil |
| Penne all'Arrabbiata Veg | 210 | Pasta | Vegetarian spicy tomato penne |
| Tortellini in Brodo | 220 | Soup | Tortellini in clear broth |
| Osso Buco | 320 | Main | Braised veal shank |
| Pizza Diavola | 300 | Pizza | Spicy salami pizza |
| Margherita Pizza Extra Cheese | 290 | Pizza | Margherita with extra mozzarella |
| Pasta Primavera | 220 | Pasta | Pasta with seasonal vegetables |
| Zuppa Toscana | 180 | Soup | Sausage and kale soup |
| Antipasto Platter | 260 | Appetizer | Assorted cured meats and cheeses |
| Chicken Piccata | 270 | Main | Chicken in lemon caper sauce |
| Spinach Ravioli Alfredo | 250 | Pasta | Spinach ravioli in Alfredo sauce |
| Panna Cotta | 140 | Dessert | Silky vanilla cream dessert |
| Cannoli Siciliani | 150 | Dessert | Sicilian pastry with sweet ricotta |
| Affogato al Caffe | 130 | Dessert | Espresso poured over gelato |
| Gelato Trio | 160 | Dessert | Three scoops of Italian gelato |
| Limoncello Cake | 170 | Dessert | Lemon liqueur sponge cake |
| Bella Garden Salad | 140 | Salad | Mixed greens with Italian dressing |
| Roman Style Pizza Marinara | 260 | Pizza | Thin-crust pizza with tomato and oregano |
| Truffle Mushroom Risotto | 300 | Main | Risotto with truffle oil and mushrooms |
| Grilled Chicken Piccata | 270 | Main | Grilled chicken in lemon caper sauce |
| Italian Meatballs Marinara | 240 | Main | Beef meatballs in marinara sauce |
| Baked Ziti | 240 | Pasta | Baked pasta with cheese and marinara |
| Prosciutto e Melone | 200 | Appetizer | Prosciutto with fresh melon |
| Italian Wedding Soup | 180 | Soup | Meatball soup with greens |
| Chicken Marsala | 280 | Main | Chicken in Marsala wine sauce |
| Seafood Linguine | 300 | Pasta | Linguine with mixed seafood |
| Tuscan White Bean Soup | 160 | Soup | White bean soup with rosemary |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Bella Italia';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Bella Italia menu to 50 items"
```

---

## Task 5: Pasta Palace — Italian (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 4 (includes Bella Italia's
  Italian-dish names — this task's names are "Palace"-branded to avoid
  collision by construction, but still verify against the registry).

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "italian ravioli plate" "four cheese pizza" "mushroom risotto plate" \
  "italian bruschetta plate" "tiramisu slice" "panna cotta dessert" \
  "italian panini sandwich" "cannoli dessert" "gelato scoop" "seafood pasta"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Palace Special Spaghetti | 240 | Pasta | House-special spaghetti in tomato sauce |
| Penne Arrabbiata Palace Style | 220 | Pasta | Spicy penne, Palace recipe |
| Palace Fettuccine Alfredo | 250 | Pasta | Fettuccine in creamy Alfredo sauce |
| Palace Style Ravioli | 250 | Pasta | House-made cheese ravioli |
| Palace Mushroom Risotto | 260 | Main | Creamy risotto with mushrooms |
| Palace Margherita Pizza | 280 | Pizza | Classic Margherita pizza |
| Palace Pepperoni Pizza | 300 | Pizza | Pepperoni topped pizza |
| Palace Four Cheese Pizza | 310 | Pizza | Pizza with four Italian cheeses |
| Palace Caprese Salad | 160 | Salad | Tomato, mozzarella, basil |
| Palace Minestrone Soup | 150 | Soup | Classic vegetable minestrone |
| Palace Bruschetta | 140 | Appetizer | Toasted bread with tomato topping |
| Palace Gnocchi | 230 | Pasta | Potato gnocchi in tomato sauce |
| Palace Carbonara | 250 | Pasta | Classic egg and pancetta pasta |
| Palace Chicken Alfredo | 270 | Pasta | Chicken in creamy Alfredo sauce |
| Palace Vegetable Lasagna | 250 | Pasta | Layered vegetable lasagna |
| Palace Spinach Tortellini | 240 | Pasta | Tortellini filled with spinach and cheese |
| Palace Seafood Pasta | 300 | Pasta | Pasta with mixed seafood |
| Palace Calzone | 260 | Pizza | Folded pizza with ricotta and ham |
| Palace Eggplant Parmesan | 240 | Main | Baked eggplant with marinara and cheese |
| Palace Caesar Salad | 170 | Salad | Romaine with Caesar dressing and croutons |
| Palace Garlic Butter Shrimp Pasta | 300 | Pasta | Pasta with garlic butter shrimp |
| Palace Pesto Linguine | 230 | Pasta | Linguine tossed in basil pesto |
| Palace Tomato Basil Soup | 140 | Soup | Creamy tomato and basil soup |
| Palace Antipasto Board | 270 | Appetizer | Assorted cured meats and cheese |
| Palace Chicken Parmesan | 280 | Main | Breaded chicken with marinara and cheese |
| Palace Baked Penne | 230 | Pasta | Baked penne with cheese |
| Palace Vegetable Risotto | 240 | Main | Risotto with seasonal vegetables |
| Palace Style Focaccia | 120 | Side | Herb focaccia bread |
| Palace Tiramisu Classic | 150 | Dessert | Classic mascarpone tiramisu |
| Palace Panna Cotta | 140 | Dessert | Silky vanilla cream dessert |
| Palace Cannoli | 150 | Dessert | Crispy shell filled with sweet ricotta |
| Palace Chocolate Gelato | 130 | Dessert | Rich chocolate gelato |
| Palace Lemon Sorbet | 110 | Dessert | Refreshing lemon sorbet |
| Palace Affogato | 130 | Dessert | Espresso over vanilla gelato |
| Palace Chicken Marsala | 280 | Main | Chicken in Marsala wine sauce |
| Palace Osso Buco Style | 320 | Main | Braised shank, Palace recipe |
| Palace Truffle Pasta | 300 | Pasta | Pasta with truffle cream sauce |
| Palace Vegetable Panini | 200 | Sandwich | Grilled vegetable panini |
| Palace Prosciutto Panini | 230 | Sandwich | Panini with prosciutto and cheese |
| Palace Roasted Vegetable Salad | 170 | Salad | Roasted seasonal vegetable salad |
| Palace Caprese Panini | 210 | Sandwich | Panini with tomato, mozzarella, basil |
| Palace Spicy Arrabbiata Penne | 220 | Pasta | Extra spicy arrabbiata penne |
| Palace Creamy Mushroom Soup | 150 | Soup | Creamy mushroom soup |
| Palace Italian Sausage Pasta | 270 | Pasta | Pasta with Italian sausage ragu |
| Palace Style Meatball Sub | 220 | Sandwich | Meatball sub with marinara and cheese |
| Palace Garlic Parmesan Bread Sticks | 130 | Side | Breadsticks with garlic parmesan |
| Palace White Wine Clam Pasta | 300 | Pasta | Pasta with clams in white wine sauce |
| Palace Zucchini Noodles Pesto | 210 | Pasta | Zucchini noodles in pesto sauce |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Pasta Palace';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Pasta Palace menu to 50 items"
```

---

## Task 6: Burger Barn — Fast Food (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "double cheeseburger" "onion rings basket" "loaded fries" "chicken nuggets" \
  "hot dog chili cheese" "milkshake chocolate" "nachos loaded" "chicken wrap" \
  "buffalo wings" "corn dog"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Barn Double Cheeseburger | 220 | Burger | Double patty cheeseburger |
| Barn Bacon Burger | 230 | Burger | Burger topped with crispy bacon |
| Barn Veggie Burger | 180 | Burger | Plant-based patty burger |
| Barn Spicy Chicken Burger | 210 | Burger | Spicy fried chicken burger |
| Barn Grilled Chicken Burger | 200 | Burger | Grilled chicken breast burger |
| Barn Mushroom Swiss Burger | 220 | Burger | Burger with mushrooms and Swiss cheese |
| Barn BBQ Burger | 220 | Burger | Burger with BBQ sauce and onion rings |
| Barn Onion Rings | 110 | Side | Crispy battered onion rings |
| Barn Loaded Fries | 160 | Side | Fries topped with cheese and bacon bits |
| Barn Curly Fries | 100 | Side | Seasoned curly fries |
| Barn Sweet Potato Fries | 110 | Side | Crispy sweet potato fries |
| Barn Chicken Nuggets | 140 | Side | Breaded chicken nuggets |
| Barn Fish Burger | 210 | Burger | Crispy fish fillet burger |
| Barn Paneer Burger | 190 | Burger | Spiced paneer patty burger |
| Barn Classic Hot Dog | 150 | Sandwich | Grilled sausage in a bun |
| Barn Chili Cheese Dog | 180 | Sandwich | Hot dog topped with chili and cheese |
| Barn Chicken Wrap | 190 | Wrap | Grilled chicken wrap with veggies |
| Barn Grilled Veg Wrap | 170 | Wrap | Grilled vegetable wrap |
| Barn Cheese Sticks | 130 | Side | Fried mozzarella cheese sticks |
| Barn Loaded Nachos | 180 | Side | Nachos with cheese, salsa, jalapenos |
| Barn Milkshake Chocolate | 130 | Beverage | Thick chocolate milkshake |
| Barn Milkshake Vanilla | 130 | Beverage | Classic vanilla milkshake |
| Barn Milkshake Strawberry | 130 | Beverage | Strawberry milkshake |
| Barn Cola Float | 110 | Beverage | Cola with vanilla ice cream |
| Barn Onion Burger Special | 220 | Burger | Burger loaded with caramelized onions |
| Barn Jalapeno Poppers | 140 | Side | Cheese-stuffed fried jalapenos |
| Barn Coleslaw | 80 | Side | Creamy cabbage coleslaw |
| Barn Garden Salad | 120 | Salad | Fresh mixed greens salad |
| Barn Chicken Popcorn | 140 | Side | Bite-sized fried chicken pieces |
| Barn Fried Egg Burger | 210 | Burger | Burger topped with a fried egg |
| Barn Triple Patty Burger | 260 | Burger | Three beef patties stacked burger |
| Barn Turkey Burger | 200 | Burger | Lean turkey patty burger |
| Barn BBQ Chicken Sandwich | 200 | Sandwich | Grilled chicken with BBQ sauce |
| Barn Grilled Cheese Sandwich | 140 | Sandwich | Classic grilled cheese sandwich |
| Barn Buffalo Wings | 210 | Appetizer | Spicy buffalo chicken wings |
| Barn Honey Mustard Wings | 210 | Appetizer | Chicken wings in honey mustard glaze |
| Barn Crispy Chicken Sandwich | 200 | Sandwich | Crispy fried chicken sandwich |
| Barn Loaded Potato Wedges | 150 | Side | Potato wedges with cheese and bacon |
| Barn Mac and Cheese Bites | 140 | Side | Fried mac and cheese balls |
| Barn Veggie Nuggets | 130 | Side | Breaded vegetable nuggets |
| Barn Corn Dog | 120 | Side | Battered sausage on a stick |
| Barn Apple Pie Slice | 100 | Dessert | Warm apple pie slice |
| Barn Brownie Sundae | 140 | Dessert | Brownie topped with ice cream |
| Barn Iced Tea | 80 | Beverage | Chilled sweetened iced tea |
| Barn Root Beer Float | 110 | Beverage | Root beer with vanilla ice cream |
| Barn Classic Combo Meal | 250 | Combo | Burger, fries, and drink combo |
| Barn Spicy Fries | 110 | Side | Fries tossed in spicy seasoning |
| Barn Cheese Burger Deluxe | 240 | Burger | Deluxe burger with double cheese |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Burger Barn';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Burger Barn menu to 50 items"
```

---

## Task 7: El Sombrero — Mexican (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "beef burrito mexican" "chicken enchiladas" "fajitas platter" "fish tacos" \
  "nachos supreme" "churros dessert" "queso dip" "chimichanga" \
  "mexican rice beans" "tres leches cake"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Sombrero Beef Burrito | 220 | Main | Beef burrito with rice and beans |
| Sombrero Chicken Burrito | 210 | Main | Chicken burrito with rice and beans |
| Sombrero Veg Burrito | 190 | Main | Vegetarian burrito with beans and rice |
| Sombrero Nachos Supreme | 220 | Appetizer | Nachos loaded with toppings |
| Sombrero Chicken Enchiladas | 230 | Main | Chicken enchiladas in red sauce |
| Sombrero Beef Enchiladas | 240 | Main | Beef enchiladas in red sauce |
| Sombrero Cheese Quesadilla | 180 | Main | Melted cheese quesadilla |
| Sombrero Fajitas Chicken | 250 | Main | Sizzling chicken fajitas |
| Sombrero Fajitas Beef | 270 | Main | Sizzling beef fajitas |
| Sombrero Vegetarian Fajitas | 220 | Main | Sizzling vegetable fajitas |
| Sombrero Refried Beans | 100 | Side | Classic refried pinto beans |
| Sombrero Mexican Rice | 90 | Side | Tomato-seasoned Mexican rice |
| Sombrero Churros | 120 | Dessert | Fried dough with cinnamon sugar |
| Sombrero Salsa Verde Tacos | 200 | Main | Tacos with green salsa |
| Sombrero Fish Tacos | 220 | Main | Grilled fish tacos with slaw |
| Sombrero Shrimp Tacos | 230 | Main | Grilled shrimp tacos |
| Sombrero Chili Con Carne | 210 | Main | Spicy beef and bean chili |
| Sombrero Tortilla Soup | 150 | Soup | Tomato broth with crispy tortilla strips |
| Sombrero Street Corn | 110 | Side | Grilled corn with cheese and chili |
| Sombrero Jalapeno Poppers | 140 | Appetizer | Cheese-stuffed fried jalapenos |
| Sombrero Queso Dip | 130 | Appetizer | Melted cheese dip with chips |
| Sombrero Chicken Tostadas | 200 | Main | Crispy tostadas with chicken |
| Sombrero Beef Tostadas | 210 | Main | Crispy tostadas with beef |
| Sombrero Taco Salad | 190 | Salad | Salad in a crispy tortilla bowl |
| Sombrero Mole Chicken | 240 | Main | Chicken in rich mole sauce |
| Sombrero Carne Asada | 260 | Main | Grilled marinated steak |
| Sombrero Chimichanga | 230 | Main | Deep-fried stuffed burrito |
| Sombrero Pico de Gallo | 80 | Side | Fresh tomato and onion salsa |
| Sombrero Spicy Rice Bowl | 200 | Main | Rice bowl with spicy chicken |
| Sombrero Pork Tacos | 210 | Main | Slow-cooked pork tacos |
| Sombrero Bean Burrito | 170 | Main | Burrito with seasoned beans and cheese |
| Sombrero Cheese Nachos | 170 | Appetizer | Nachos with melted cheese |
| Sombrero Chipotle Chicken Bowl | 220 | Main | Rice bowl with chipotle chicken |
| Sombrero Guacamole Deluxe | 130 | Appetizer | Guacamole with extra toppings |
| Sombrero Mexican Corn Salad | 130 | Salad | Corn salad with lime and cotija |
| Sombrero Horchata | 90 | Beverage | Sweet rice and cinnamon drink |
| Sombrero Mango Margarita Mocktail | 130 | Beverage | Mango mocktail, margarita style |
| Sombrero Lime Rice | 90 | Side | Cilantro lime rice |
| Sombrero Chicken Tinga Tacos | 210 | Main | Shredded chicken tacos in chipotle sauce |
| Sombrero Steak Quesadilla | 240 | Main | Quesadilla with grilled steak |
| Sombrero Veggie Quesadilla | 180 | Main | Quesadilla with grilled vegetables |
| Sombrero Sopapillas | 110 | Dessert | Fried pastry with honey |
| Sombrero Flan | 110 | Dessert | Classic caramel custard |
| Sombrero Tres Leches Cake | 130 | Dessert | Sponge cake soaked in three milks |
| Sombrero Spicy Chicken Wings Mexican Style | 200 | Appetizer | Chicken wings in chipotle glaze |
| Sombrero Elote Cup | 100 | Side | Corn kernels with cheese and lime |
| Sombrero Black Bean Soup | 140 | Soup | Hearty black bean soup |
| Sombrero Cactus Salad | 120 | Salad | Nopal cactus salad with lime |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'El Sombrero';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand El Sombrero menu to 50 items"
```

---

## Task 8: Taco Fiesta — Mexican (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 7 (includes El Sombrero's
  Mexican-dish names — this task's names are "Fiesta"-branded to avoid
  collision by construction, but still verify against the registry).

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "chicken tacos plate" "burrito bowl" "pozole soup" "mexican street corn" \
  "chile relleno" "ceviche shrimp" "taquitos plate" "horchata drink" \
  "mexican chocolate cake" "loaded nacho fries"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Fiesta Chicken Tacos | 200 | Main | Grilled chicken tacos |
| Fiesta Fish Tacos | 220 | Main | Beer-battered fish tacos |
| Fiesta Shrimp Tacos | 230 | Main | Grilled shrimp tacos |
| Fiesta Veggie Tacos | 180 | Main | Grilled vegetable tacos |
| Fiesta Al Pastor Tacos | 220 | Main | Marinated pork tacos with pineapple |
| Fiesta Carnitas Tacos | 220 | Main | Slow-cooked pulled pork tacos |
| Fiesta Burrito Bowl | 210 | Main | Rice bowl with beans, meat, salsa |
| Fiesta Chicken Burrito | 210 | Main | Chicken burrito with rice and beans |
| Fiesta Beef Burrito | 220 | Main | Beef burrito with rice and beans |
| Fiesta Bean and Cheese Burrito | 170 | Main | Vegetarian bean and cheese burrito |
| Fiesta Nachos Grande | 230 | Appetizer | Large loaded nacho platter |
| Fiesta Chicken Enchiladas | 230 | Main | Chicken enchiladas in green sauce |
| Fiesta Cheese Enchiladas | 210 | Main | Cheese-filled enchiladas |
| Fiesta Fajita Platter | 260 | Main | Mixed fajita platter with tortillas |
| Fiesta Rice and Beans | 100 | Side | Classic rice and beans side |
| Fiesta Elote | 100 | Side | Grilled corn with cheese and chili |
| Fiesta Churro Bites | 110 | Dessert | Bite-sized cinnamon churros |
| Fiesta Flan Especial | 120 | Dessert | House-special caramel flan |
| Fiesta Tres Leches | 130 | Dessert | Three-milk sponge cake |
| Fiesta Salsa Roja | 60 | Side | Red table salsa |
| Fiesta Salsa Verde | 60 | Side | Green tomatillo salsa |
| Fiesta Queso Fundido | 140 | Appetizer | Melted cheese with chorizo |
| Fiesta Chile Relleno | 210 | Main | Stuffed poblano pepper, fried |
| Fiesta Pozole | 190 | Soup | Hominy and pork stew |
| Fiesta Tortilla Chips and Salsa | 90 | Appetizer | Crispy chips with fresh salsa |
| Fiesta Spicy Chicken Bowl | 210 | Main | Rice bowl with spicy chicken |
| Fiesta Steak Tacos | 240 | Main | Grilled steak tacos |
| Fiesta Carne Asada Fries | 220 | Appetizer | Fries topped with steak and cheese |
| Fiesta Mexican Street Corn Salad | 130 | Salad | Corn salad with lime and cotija |
| Fiesta Horchata Drink | 90 | Beverage | Sweet cinnamon rice drink |
| Fiesta Jamaica Agua Fresca | 80 | Beverage | Hibiscus flower cooler |
| Fiesta Chicken Taquitos | 170 | Appetizer | Crispy rolled chicken taquitos |
| Fiesta Beef Taquitos | 180 | Appetizer | Crispy rolled beef taquitos |
| Fiesta Mango Salsa Bowl | 90 | Side | Fresh mango salsa |
| Fiesta Cilantro Lime Rice | 90 | Side | Rice with cilantro and lime |
| Fiesta Black Bean Dip | 100 | Appetizer | Creamy black bean dip |
| Fiesta Cheese Dip | 110 | Appetizer | Warm melted cheese dip |
| Fiesta Loaded Nacho Fries | 200 | Appetizer | Fries loaded with nacho toppings |
| Fiesta Shrimp Ceviche | 220 | Appetizer | Citrus-marinated shrimp ceviche |
| Fiesta Chicken Torta | 200 | Sandwich | Mexican sandwich with chicken |
| Fiesta Vegetarian Bowl | 190 | Main | Rice bowl with grilled vegetables |
| Fiesta Tostada Especial | 200 | Main | House-special loaded tostada |
| Fiesta Spicy Guac Bowl | 130 | Appetizer | Guacamole with a spicy kick |
| Fiesta Mexican Chocolate Cake | 150 | Dessert | Spiced chocolate cake |
| Fiesta Lime Sorbet | 100 | Dessert | Refreshing lime sorbet |
| Fiesta Chili Cheese Fries | 170 | Appetizer | Fries topped with chili and cheese |
| Fiesta Grilled Corn Salad | 120 | Salad | Grilled corn and pepper salad |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Taco Fiesta';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Taco Fiesta menu to 50 items"
```

---

## Task 9: Demo Kitchen — Indian/Fast Food (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "chicken tikka masala" "dal makhani bowl" "chicken biryani" "tandoori chicken" \
  "samosa plate" "vada pav" "chicken momos" "gulab jamun sweet" \
  "masala chai cup" "pav bhaji"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Demo Chicken Tikka Masala | 240 | Main | Chicken in creamy tomato masala |
| Demo Dal Makhani | 190 | Main | Slow-cooked black lentils in butter |
| Demo Aloo Gobi | 160 | Main | Potato and cauliflower curry |
| Demo Chana Masala | 170 | Main | Spiced chickpea curry |
| Demo Veg Kofta | 190 | Main | Vegetable dumplings in gravy |
| Demo Butter Naan | 60 | Bread | Naan brushed with butter |
| Demo Garlic Naan | 70 | Bread | Naan topped with garlic |
| Demo Tandoori Roti | 40 | Bread | Whole wheat tandoor-baked bread |
| Demo Veg Pulao | 170 | Rice | Fragrant rice with mixed vegetables |
| Demo Chicken Biryani | 260 | Rice | Layered chicken and spiced rice |
| Demo Mutton Curry | 300 | Main | Slow-cooked mutton in spiced gravy |
| Demo Egg Curry | 180 | Main | Boiled eggs in onion tomato gravy |
| Demo Malai Kofta | 220 | Main | Paneer dumplings in creamy gravy |
| Demo Rajma Chawal | 180 | Main | Kidney bean curry with rice |
| Demo Kadhi Pakora | 170 | Main | Yogurt curry with gram flour fritters |
| Demo Bhindi Masala | 160 | Main | Spiced okra stir-fry |
| Demo Mixed Veg Curry | 170 | Main | Assorted vegetables in curry |
| Demo Dal Tadka | 160 | Main | Yellow lentils tempered with spices |
| Demo Palak Paneer Demo Style | 210 | Main | Cottage cheese in spinach gravy |
| Demo Chicken 65 | 220 | Appetizer | Spicy deep-fried chicken bites |
| Demo Veg Manchurian Demo Style | 180 | Appetizer | Fried vegetable balls in sauce |
| Demo Hakka Noodles Demo Style | 180 | Noodles | Stir-fried Indo-Chinese noodles |
| Demo Spring Rolls Demo Style | 140 | Appetizer | Crispy vegetable spring rolls |
| Demo Chicken Momos | 170 | Appetizer | Steamed chicken dumplings |
| Demo Veg Momos | 150 | Appetizer | Steamed vegetable dumplings |
| Demo Paneer Tikka | 210 | Appetizer | Grilled marinated cottage cheese |
| Demo Tandoori Chicken | 260 | Main | Char-grilled marinated chicken |
| Demo Seekh Kebab | 230 | Appetizer | Grilled minced meat skewers |
| Demo Fish Curry | 250 | Main | Fish in spiced curry sauce |
| Demo Prawn Curry | 270 | Main | Prawns in coconut curry sauce |
| Demo Cheese Naan | 90 | Bread | Naan stuffed with cheese |
| Demo Papad | 30 | Side | Crispy roasted lentil wafer |
| Demo Raita | 50 | Side | Cooling yogurt with cucumber |
| Demo Gulab Jamun Demo Style | 90 | Dessert | Soft milk dumplings in sugar syrup |
| Demo Rasmalai | 110 | Dessert | Cottage cheese dumplings in sweet milk |
| Demo Kheer | 100 | Dessert | Creamy rice pudding |
| Demo Masala Chai | 50 | Beverage | Spiced Indian milk tea |
| Demo Lassi Sweet | 70 | Beverage | Sweet yogurt-based drink |
| Demo Chicken Roll | 160 | Wrap | Chicken wrapped in flatbread |
| Demo Egg Roll | 130 | Wrap | Egg wrapped in flatbread |
| Demo Veg Roll | 120 | Wrap | Vegetables wrapped in flatbread |
| Demo Chilli Chicken Demo Style | 220 | Appetizer | Spicy Indo-Chinese chicken |
| Demo Crispy Corn | 130 | Appetizer | Crispy fried corn kernels |
| Demo Veg Cutlet | 110 | Appetizer | Spiced vegetable patties |
| Demo Aloo Tikki | 100 | Appetizer | Spiced potato patties |
| Demo Samosa | 60 | Appetizer | Fried pastry with spiced potato filling |
| Demo Pav Bhaji | 170 | Main | Spiced mashed vegetable curry with buns |
| Demo Vada Pav | 60 | Snack | Spiced potato fritter in a bun |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Demo Kitchen';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Demo Kitchen menu to 50 items"
```

---

## Task 10: Punjabi Dhaba — North Indian (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 9 (includes Demo Kitchen's
  Indian-dish names — this task's names are "Dhaba"-branded to avoid
  collision by construction, but still verify against the registry).

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "butter chicken dhaba" "sarson saag" "amritsari kulcha" "kadai paneer" \
  "mutton rogan josh" "aloo paratha" "shahi paneer" "tandoori prawns" \
  "gajar halwa dessert" "punjabi lassi"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Dhaba Butter Chicken Special | 280 | Main | Rich tomato-butter chicken curry |
| Dhaba Dal Makhani Creamy | 200 | Main | Slow-simmered black lentils in cream |
| Dhaba Sarson da Saag | 190 | Main | Mustard greens curry |
| Dhaba Makki di Roti | 50 | Bread | Cornmeal flatbread |
| Dhaba Amritsari Fish | 260 | Appetizer | Spiced fried fish, Amritsari style |
| Dhaba Kulcha | 60 | Bread | Stuffed leavened flatbread |
| Dhaba Paneer Bhurji | 190 | Main | Scrambled spiced cottage cheese |
| Dhaba Rajma | 170 | Main | Kidney bean curry, Punjabi style |
| Dhaba Kadai Chicken | 250 | Main | Chicken in spiced kadai gravy |
| Dhaba Kadai Paneer | 220 | Main | Cottage cheese in spiced kadai gravy |
| Dhaba Tandoori Chicken Full | 320 | Main | Full char-grilled tandoori chicken |
| Dhaba Chicken Seekh Kebab | 240 | Appetizer | Grilled minced chicken skewers |
| Dhaba Mutton Rogan Josh | 320 | Main | Aromatic slow-cooked mutton curry |
| Dhaba Aloo Paratha | 90 | Bread | Potato-stuffed flatbread |
| Dhaba Paneer Paratha | 100 | Bread | Cottage cheese-stuffed flatbread |
| Dhaba Lachha Paratha | 70 | Bread | Layered flaky flatbread |
| Dhaba Dal Fry | 160 | Main | Tempered yellow lentils |
| Dhaba Punjabi Kadhi | 170 | Main | Yogurt curry with fritters |
| Dhaba Amritsari Chole | 180 | Main | Spiced chickpea curry, Amritsari style |
| Dhaba Butter Naan Special | 70 | Bread | Butter-brushed naan |
| Dhaba Garlic Naan Punjabi Style | 80 | Bread | Garlic-topped naan |
| Dhaba Lassi Salted | 70 | Beverage | Savory salted yogurt drink |
| Dhaba Shahi Paneer | 220 | Main | Cottage cheese in royal creamy gravy |
| Dhaba Egg Bhurji | 150 | Main | Spiced scrambled eggs |
| Dhaba Chicken Curry Dhaba Style | 250 | Main | Rustic dhaba-style chicken curry |
| Dhaba Mixed Veg Sabzi | 170 | Main | Mixed seasonal vegetable curry |
| Dhaba Bhindi Do Pyaza | 170 | Main | Okra cooked with onions |
| Dhaba Onion Salad | 50 | Side | Sliced onions with lemon and spice |
| Dhaba Papad Roasted | 30 | Side | Roasted lentil wafer |
| Dhaba Achaar Platter | 40 | Side | Assorted Indian pickles |
| Dhaba Gajar Halwa | 110 | Dessert | Sweet carrot pudding |
| Dhaba Kheer Punjabi Style | 100 | Dessert | Creamy rice pudding |
| Dhaba Jeera Rice | 90 | Rice | Cumin-tempered basmati rice |
| Dhaba Veg Biryani Dhaba Style | 200 | Rice | Rustic vegetable biryani |
| Dhaba Chicken Malai Tikka | 250 | Appetizer | Creamy marinated grilled chicken |
| Dhaba Tandoori Prawns | 300 | Appetizer | Char-grilled marinated prawns |
| Dhaba Punjabi Samosa | 60 | Appetizer | Spiced potato-filled pastry |
| Dhaba Pakora Platter | 140 | Appetizer | Assorted vegetable fritters |
| Dhaba Stuffed Kulcha | 90 | Bread | Kulcha stuffed with spiced potato |
| Dhaba Amritsari Kulfi | 100 | Dessert | Traditional Indian ice cream |
| Dhaba Rabri | 120 | Dessert | Sweetened thickened milk |
| Dhaba Special Thali | 350 | Main | Full platter with curry, bread, rice, dessert |
| Dhaba Chicken Malai Boti | 260 | Appetizer | Creamy marinated grilled chicken chunks |
| Dhaba Paneer Lababdar | 220 | Main | Cottage cheese in rich tomato gravy |
| Dhaba Egg Curry Punjabi | 190 | Main | Eggs in spiced Punjabi curry |
| Dhaba Punjabi Chaas | 60 | Beverage | Spiced buttermilk drink |
| Dhaba Matar Paneer | 210 | Main | Cottage cheese and peas curry |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Punjabi Dhaba';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Punjabi Dhaba menu to 50 items"
```

---

## Task 11: Spice Route — Indian (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 10 (includes Demo Kitchen's
  and Punjabi Dhaba's Indian-dish names — this task's names are
  "Spice Route"/"Route"-branded to avoid collision by construction, but
  still verify against the registry).

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "hyderabadi biryani" "chicken chettinad" "goan fish curry" "chicken vindaloo" \
  "mysore dosa" "prawn biryani" "kashmiri pulao" "chicken malabar" \
  "filter coffee south indian" "kesari halwa"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Spice Route Chicken Korma | 250 | Main | Chicken in mild creamy korma sauce |
| Spice Route Mutton Biryani | 310 | Rice | Layered mutton and spiced rice |
| Spice Route Hyderabadi Biryani | 290 | Rice | Aromatic Hyderabadi-style biryani |
| Spice Route Dal Tadka Special | 170 | Main | Tempered yellow lentils, house special |
| Spice Route Baingan Bharta | 170 | Main | Smoky mashed eggplant curry |
| Spice Route Aloo Jeera | 150 | Main | Cumin-spiced potato stir-fry |
| Spice Route Malai Kofta Route Style | 220 | Main | Paneer dumplings in creamy gravy |
| Spice Route Chicken Chettinad | 260 | Main | Spicy South Indian chicken curry |
| Spice Route Fish Curry Route Style | 250 | Main | Fish in tangy spiced curry |
| Spice Route Prawn Masala | 270 | Main | Prawns in spiced masala gravy |
| Spice Route Egg Masala | 180 | Main | Eggs in spiced onion tomato gravy |
| Spice Route Veg Kolhapuri | 180 | Main | Spicy mixed vegetable curry |
| Spice Route Paneer Tikka Masala | 220 | Main | Grilled paneer in creamy masala |
| Spice Route Tandoori Chicken Route Style | 300 | Main | Char-grilled marinated chicken |
| Spice Route Naan Basket | 150 | Bread | Assorted naan basket |
| Spice Route Roti Basket | 100 | Bread | Assorted roti basket |
| Spice Route Jeera Aloo | 150 | Main | Cumin potato stir-fry |
| Spice Route Kashmiri Pulao | 200 | Rice | Sweet and savory fruit-nut rice |
| Spice Route Chicken 65 Route Style | 220 | Appetizer | Spicy deep-fried chicken bites |
| Spice Route Kadai Vegetable | 180 | Main | Mixed vegetables in kadai masala |
| Spice Route Mysore Masala Dosa | 150 | Main | Spiced dosa with chutney filling |
| Spice Route Rasam | 90 | Soup | Tangy South Indian pepper soup |
| Spice Route Sambar Rice | 150 | Rice | Rice mixed with lentil vegetable stew |
| Spice Route Curd Rice | 120 | Rice | Rice mixed with yogurt |
| Spice Route Vegetable Korma | 180 | Main | Mixed vegetables in korma sauce |
| Spice Route Chicken Vindaloo | 260 | Main | Fiery Goan-style chicken curry |
| Spice Route Goan Fish Curry | 260 | Main | Coconut-based Goan fish curry |
| Spice Route Prawn Biryani | 300 | Rice | Layered prawns and spiced rice |
| Spice Route Mutton Kheema | 280 | Main | Spiced minced mutton curry |
| Spice Route Paneer Do Pyaza | 210 | Main | Cottage cheese with onions |
| Spice Route Chicken Malabar | 260 | Main | Coconut-based Malabar chicken curry |
| Spice Route Coconut Chutney Platter | 60 | Side | Fresh coconut chutney |
| Spice Route Papadum Basket | 50 | Side | Assorted crispy papadums |
| Spice Route Mango Chutney | 50 | Side | Sweet and tangy mango chutney |
| Spice Route Onion Raita | 60 | Side | Yogurt with onions and spices |
| Spice Route Boondi Raita | 60 | Side | Yogurt with fried gram flour pearls |
| Spice Route Gulab Jamun Route Style | 100 | Dessert | Milk dumplings in sugar syrup |
| Spice Route Kesari Halwa | 100 | Dessert | Sweet semolina pudding |
| Spice Route Masala Chai Route Style | 60 | Beverage | Spiced milk tea |
| Spice Route Filter Coffee | 70 | Beverage | South Indian filter coffee |
| Spice Route Chicken Tikka Skewers | 240 | Appetizer | Grilled marinated chicken skewers |
| Spice Route Vegetable Seekh Kebab | 190 | Appetizer | Grilled minced vegetable skewers |
| Spice Route Amritsari Fish Route Style | 260 | Appetizer | Spiced fried fish |
| Spice Route Paneer Malai Tikka | 220 | Appetizer | Creamy grilled paneer skewers |
| Spice Route Chicken Reshmi Kebab | 250 | Appetizer | Silky grilled chicken kebabs |
| Spice Route Tandoori Mushroom | 190 | Appetizer | Char-grilled marinated mushrooms |
| Spice Route Veg Seekh Roll | 150 | Wrap | Vegetable seekh kebab in a wrap |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Spice Route';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Spice Route menu to 50 items"
```

---

## Task 12: Dosa Corner — South Indian (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "rava dosa" "uttapam plate" "idli sambar plate" "ghee roast dosa" \
  "bisi bele bath" "appam stew" "filter coffee south indian" "mysore pak" \
  "vada sambar plate" "paniyaram"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Corner Rava Dosa | 130 | Main | Crispy semolina dosa |
| Corner Onion Dosa | 120 | Main | Dosa topped with onions |
| Corner Paneer Dosa | 150 | Main | Dosa stuffed with spiced paneer |
| Corner Cheese Dosa | 150 | Main | Dosa filled with melted cheese |
| Corner Mysore Masala Dosa | 140 | Main | Spicy chutney-filled dosa |
| Corner Set Dosa | 120 | Main | Soft fluffy mini dosas, set of three |
| Corner Uttapam Onion | 120 | Main | Thick pancake topped with onions |
| Corner Uttapam Tomato | 120 | Main | Thick pancake topped with tomato |
| Corner Uttapam Mixed Veg | 130 | Main | Thick pancake with mixed vegetables |
| Corner Ghee Roast Dosa | 150 | Main | Crispy dosa roasted in ghee |
| Corner Podi Dosa | 130 | Main | Dosa with spiced lentil powder |
| Corner Pesarattu | 120 | Main | Green gram dosa |
| Corner Upma | 90 | Main | Savory semolina porridge |
| Corner Pongal | 100 | Main | Rice and lentil khichdi, South Indian style |
| Corner Vada Sambar | 100 | Appetizer | Fried lentil doughnuts with sambar |
| Corner Rasam Rice | 110 | Rice | Rice mixed with tangy pepper soup |
| Corner Sambar Rice Special | 130 | Rice | Rice with house-special sambar |
| Corner Curd Rice Corner Style | 110 | Rice | Rice mixed with yogurt and tempering |
| Corner Lemon Rice | 100 | Rice | Tangy lemon-tempered rice |
| Corner Tamarind Rice | 110 | Rice | Tangy tamarind-flavored rice |
| Corner Coconut Rice | 100 | Rice | Rice tempered with coconut |
| Corner Bisi Bele Bath | 150 | Main | Spiced rice and lentil dish |
| Corner Idiyappam | 110 | Main | Steamed rice noodle cakes |
| Corner Appam with Stew | 160 | Main | Lacy rice pancake with vegetable stew |
| Corner Filter Coffee Corner Style | 60 | Beverage | Traditional South Indian filter coffee |
| Corner Coconut Chutney | 40 | Side | Fresh coconut chutney |
| Corner Tomato Chutney | 40 | Side | Spiced tomato chutney |
| Corner Mint Chutney | 40 | Side | Fresh mint chutney |
| Corner Sambar Vada | 100 | Appetizer | Lentil doughnuts soaked in sambar |
| Corner Curd Vada | 100 | Appetizer | Lentil doughnuts in spiced yogurt |
| Corner Mini Idli | 100 | Appetizer | Bite-sized steamed rice cakes |
| Corner Podi Idli | 110 | Appetizer | Idli tossed in spiced lentil powder |
| Corner Ghee Idli | 100 | Appetizer | Steamed idli drizzled with ghee |
| Corner Kancheepuram Idli | 120 | Appetizer | Spiced steamed rice cakes |
| Corner Vermicelli Upma | 100 | Main | Savory vermicelli porridge |
| Corner Rava Upma | 90 | Main | Savory semolina porridge |
| Corner Chettinad Dosa | 150 | Main | Spicy Chettinad-style dosa |
| Corner Spinach Dosa | 130 | Main | Dosa made with spinach batter |
| Corner Karnataka Set Dosa | 120 | Main | Soft mini dosas, Karnataka style |
| Corner Neer Dosa | 110 | Main | Thin lacy rice dosa |
| Corner Adai | 130 | Main | Mixed lentil savory pancake |
| Corner Paniyaram | 110 | Appetizer | Fried batter dumplings |
| Corner Banana Chips | 60 | Side | Crispy fried banana chips |
| Corner Payasam | 100 | Dessert | Sweet South Indian milk pudding |
| Corner Mysore Pak | 90 | Dessert | Rich gram flour sweet |
| Corner Filter Coffee Special | 70 | Beverage | House-special strong filter coffee |
| Corner South Indian Thali | 250 | Main | Full platter of South Indian dishes |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Dosa Corner';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Dosa Corner menu to 50 items"
```

---

## Task 13: Fresh Fit — Healthy (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "quinoa bowl healthy" "grilled salmon salad" "buddha bowl vegan" \
  "protein smoothie" "avocado salad bowl" "overnight oats jar" \
  "chia pudding" "cold pressed juice" "grilled chicken bowl" "protein pancakes"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Fresh Fit Quinoa Power Bowl | 220 | Bowl | Quinoa with roasted vegetables |
| Fresh Fit Grilled Chicken Bowl | 250 | Bowl | Grilled chicken with greens and grains |
| Fresh Fit Vegan Buddha Bowl | 220 | Bowl | Plant-based grain and vegetable bowl |
| Fresh Fit Avocado Salad | 190 | Salad | Avocado, greens, and cherry tomato salad |
| Fresh Fit Kale Caesar Salad | 200 | Salad | Kale with light Caesar dressing |
| Fresh Fit Greek Salad | 190 | Salad | Cucumber, feta, olive Greek salad |
| Fresh Fit Chickpea Salad | 170 | Salad | Chickpeas with herbs and lemon |
| Fresh Fit Sweet Potato Bowl | 200 | Bowl | Roasted sweet potato grain bowl |
| Fresh Fit Grilled Salmon Bowl | 290 | Bowl | Grilled salmon over quinoa and greens |
| Fresh Fit Broccoli Stir-Fry Bowl | 200 | Bowl | Stir-fried broccoli with brown rice |
| Fresh Fit Egg White Omelette | 160 | Main | Omelette made with egg whites |
| Fresh Fit Overnight Oats | 140 | Breakfast | Oats soaked overnight with fruit |
| Fresh Fit Protein Smoothie | 170 | Beverage | Whey protein fruit smoothie |
| Fresh Fit Green Detox Juice | 140 | Beverage | Cold-pressed green vegetable juice |
| Fresh Fit Beetroot Salad | 160 | Salad | Roasted beetroot with greens |
| Fresh Fit Spinach and Feta Salad | 190 | Salad | Spinach with feta and walnuts |
| Fresh Fit Lentil Soup | 150 | Soup | Protein-rich lentil soup |
| Fresh Fit Grilled Paneer Bowl | 220 | Bowl | Grilled paneer with quinoa |
| Fresh Fit Tofu Stir-Fry Bowl | 210 | Bowl | Stir-fried tofu with vegetables |
| Fresh Fit Millet Khichdi | 180 | Main | Millet and lentil one-pot meal |
| Fresh Fit Sprouts Salad | 150 | Salad | Mixed sprouts with lemon dressing |
| Fresh Fit Multigrain Wrap | 190 | Wrap | Multigrain wrap with veggies |
| Fresh Fit Hummus and Veggies | 160 | Appetizer | Hummus with fresh vegetable sticks |
| Fresh Fit Chia Pudding | 130 | Dessert | Chia seeds soaked in almond milk |
| Fresh Fit Protein Pancakes | 180 | Breakfast | High-protein pancakes with fruit |
| Fresh Fit Grilled Fish Salad | 240 | Salad | Grilled fish over mixed greens |
| Fresh Fit Roasted Vegetable Bowl | 190 | Bowl | Roasted seasonal vegetable bowl |
| Fresh Fit Brown Rice Bowl | 180 | Bowl | Brown rice with steamed vegetables |
| Fresh Fit Quinoa Tabbouleh | 170 | Salad | Quinoa tabbouleh with herbs |
| Fresh Fit Steamed Vegetable Platter | 150 | Side | Assorted steamed vegetables |
| Fresh Fit Almond Milk Smoothie | 160 | Beverage | Smoothie made with almond milk |
| Fresh Fit Berry Protein Shake | 170 | Beverage | Mixed berry protein shake |
| Fresh Fit Edamame Salad | 160 | Salad | Edamame with sesame dressing |
| Fresh Fit Cottage Cheese Bowl | 190 | Bowl | Cottage cheese with fruit and nuts |
| Fresh Fit Vegetable Clear Soup | 120 | Soup | Light clear vegetable soup |
| Fresh Fit Grilled Turkey Bowl | 250 | Bowl | Grilled turkey with grains and greens |
| Fresh Fit Zucchini Noodles Salad | 170 | Salad | Zucchini noodles with light dressing |
| Fresh Fit Roasted Chickpeas Snack | 100 | Snack | Crunchy roasted chickpeas |
| Fresh Fit Fruit and Nut Bowl | 150 | Snack | Mixed fresh fruit and nuts |
| Fresh Fit Cold Pressed Juice | 140 | Beverage | Fresh cold-pressed fruit juice |
| Fresh Fit Wheatgrass Shot | 80 | Beverage | Fresh wheatgrass juice shot |
| Fresh Fit Protein Energy Balls | 110 | Snack | Date and protein energy bites |
| Fresh Fit Millet Salad | 170 | Salad | Millet with roasted vegetables |
| Fresh Fit Grilled Vegetable Wrap | 180 | Wrap | Grilled vegetables in a whole-wheat wrap |
| Fresh Fit Low Cal Fruit Bowl | 130 | Snack | Seasonal fruit, low-calorie |
| Fresh Fit Detox Water | 60 | Beverage | Infused fruit and herb water |
| Fresh Fit Peanut Butter Smoothie | 170 | Beverage | Peanut butter and banana smoothie |
| Fresh Fit Herbal Tea | 60 | Beverage | Caffeine-free herbal infusion |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Fresh Fit';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Fresh Fit menu to 50 items"
```

---

## Task 14: Green Bowl — Healthy (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 13 (includes Fresh Fit's
  healthy-food names — this task's names are "Green Bowl"-branded to
  avoid collision by construction, but still verify against the
  registry).

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "acai bowl" "kale smoothie" "roasted beet salad" "matcha latte" \
  "vegan wrap" "granola bowl" "greek yogurt parfait" "watermelon feta salad" \
  "turmeric golden milk" "cold brew coffee"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Green Bowl Kale Smoothie | 160 | Beverage | Kale and fruit smoothie |
| Green Bowl Spinach Power Bowl | 200 | Bowl | Spinach with grains and protein |
| Green Bowl Grilled Tofu Salad | 190 | Salad | Grilled tofu over mixed greens |
| Green Bowl Roasted Beet Bowl | 190 | Bowl | Roasted beets with quinoa |
| Green Bowl Chickpea Buddha Bowl | 200 | Bowl | Chickpeas, grains, and greens |
| Green Bowl Sweet Potato Mash | 140 | Side | Mashed sweet potato |
| Green Bowl Edamame Bowl | 160 | Bowl | Edamame with brown rice |
| Green Bowl Broccoli Almond Salad | 170 | Salad | Broccoli with toasted almonds |
| Green Bowl Carrot Ginger Soup | 140 | Soup | Creamy carrot and ginger soup |
| Green Bowl Lentil Power Bowl | 190 | Bowl | Lentils with roasted vegetables |
| Green Bowl Cucumber Mint Salad | 130 | Salad | Cucumber salad with fresh mint |
| Green Bowl Grilled Shrimp Bowl | 260 | Bowl | Grilled shrimp with quinoa |
| Green Bowl Mixed Berry Bowl | 160 | Snack | Fresh mixed berries |
| Green Bowl Acai Bowl | 200 | Breakfast | Acai puree topped with granola |
| Green Bowl Green Detox Smoothie | 160 | Beverage | Leafy green detox smoothie |
| Green Bowl Roasted Cauliflower Bowl | 180 | Bowl | Roasted cauliflower with grains |
| Green Bowl Tempeh Stir-Fry Bowl | 200 | Bowl | Stir-fried tempeh with vegetables |
| Green Bowl Vegan Wrap | 180 | Wrap | Plant-based wrap with vegetables |
| Green Bowl Hummus Plate | 150 | Appetizer | Hummus with pita and vegetables |
| Green Bowl Grilled Vegetable Skewers | 170 | Appetizer | Skewered grilled seasonal vegetables |
| Green Bowl Millet Bowl | 180 | Bowl | Millet with roasted vegetables |
| Green Bowl Barley Salad | 170 | Salad | Barley with herbs and lemon |
| Green Bowl Roasted Pumpkin Bowl | 190 | Bowl | Roasted pumpkin with quinoa |
| Green Bowl Nut and Seed Granola | 140 | Breakfast | Homemade nut and seed granola |
| Green Bowl Oat Milk Smoothie | 160 | Beverage | Smoothie made with oat milk |
| Green Bowl Greek Yogurt Parfait | 150 | Breakfast | Layered yogurt, granola, fruit |
| Green Bowl Citrus Salad | 150 | Salad | Mixed citrus fruit salad |
| Green Bowl Grilled Chicken Wrap | 210 | Wrap | Grilled chicken with greens wrap |
| Green Bowl Steamed Broccoli Plate | 120 | Side | Simple steamed broccoli |
| Green Bowl Roasted Brussels Sprouts | 150 | Side | Oven-roasted Brussels sprouts |
| Green Bowl Cold Brew Coffee | 110 | Beverage | Smooth cold brew coffee |
| Green Bowl Matcha Latte | 140 | Beverage | Matcha green tea latte |
| Green Bowl Turmeric Golden Milk | 120 | Beverage | Warm turmeric spiced milk |
| Green Bowl Protein Salad Bowl | 210 | Bowl | High-protein mixed salad bowl |
| Green Bowl Vegan Buddha Platter | 220 | Bowl | Full vegan grain and vegetable platter |
| Green Bowl Herb Roasted Vegetables | 160 | Side | Herb-seasoned roasted vegetables |
| Green Bowl Grilled Mushroom Bowl | 180 | Bowl | Grilled mushrooms with grains |
| Green Bowl Mixed Sprout Salad | 150 | Salad | Sprouted legumes with lemon dressing |
| Green Bowl Citrus Detox Juice | 140 | Beverage | Citrus-based detox juice |
| Green Bowl Spirulina Smoothie | 170 | Beverage | Spirulina and fruit smoothie |
| Green Bowl Roasted Chickpea Bowl | 180 | Bowl | Roasted chickpeas with vegetables |
| Green Bowl Baked Sweet Potato Fries | 140 | Side | Oven-baked sweet potato fries |
| Green Bowl Herb Quinoa | 150 | Side | Quinoa with fresh herbs |
| Green Bowl Green Apple Salad | 140 | Salad | Green apple and walnut salad |
| Green Bowl Pumpkin Seed Granola | 140 | Breakfast | Granola with roasted pumpkin seeds |
| Green Bowl Mixed Nut Trail Bowl | 130 | Snack | Mixed nuts and dried fruit |
| Green Bowl Watermelon Feta Salad | 160 | Salad | Watermelon with feta and mint |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Green Bowl';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Green Bowl menu to 50 items"
```

---

## Task 15: Juice Junction — Beverages (2 existing → 50 total, +48 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "watermelon juice glass" "mango smoothie" "cold coffee glass" "iced latte" \
  "coconut water" "sugarcane juice" "hot chocolate mug" "masala chai cup" \
  "dragon fruit juice" "aloe vera juice"
```

- [ ] **Step 2: Read the registry, then add these 48 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Junction Watermelon Juice | 90 | Beverage | Fresh watermelon juice |
| Junction Pineapple Juice | 90 | Beverage | Fresh pineapple juice |
| Junction Mango Smoothie | 130 | Beverage | Fresh mango smoothie |
| Junction Banana Shake | 120 | Beverage | Creamy banana milkshake |
| Junction Strawberry Smoothie | 130 | Beverage | Fresh strawberry smoothie |
| Junction Beetroot Juice | 100 | Beverage | Fresh beetroot and carrot juice |
| Junction Carrot Juice | 90 | Beverage | Fresh carrot juice |
| Junction Apple Juice | 90 | Beverage | Fresh apple juice |
| Junction Pomegranate Juice | 110 | Beverage | Fresh pomegranate juice |
| Junction Kiwi Juice | 100 | Beverage | Fresh kiwi juice |
| Junction Mixed Fruit Juice | 110 | Beverage | Blend of seasonal fruits |
| Junction Coconut Water | 70 | Beverage | Fresh tender coconut water |
| Junction Sugarcane Juice | 60 | Beverage | Fresh pressed sugarcane juice |
| Junction Cold Coffee | 110 | Beverage | Chilled blended coffee |
| Junction Cappuccino | 100 | Beverage | Espresso with steamed milk foam |
| Junction Latte | 110 | Beverage | Espresso with steamed milk |
| Junction Espresso Shot | 70 | Beverage | Strong single espresso shot |
| Junction Mocha | 120 | Beverage | Espresso with chocolate and milk |
| Junction Green Tea | 60 | Beverage | Steeped green tea |
| Junction Lemon Iced Tea | 80 | Beverage | Chilled lemon-flavored iced tea |
| Junction Peach Iced Tea | 90 | Beverage | Chilled peach-flavored iced tea |
| Junction Masala Chai Junction Style | 50 | Beverage | Spiced Indian milk tea |
| Junction Hot Chocolate | 110 | Beverage | Rich hot chocolate drink |
| Junction Chocolate Milkshake | 130 | Beverage | Thick chocolate milkshake |
| Junction Vanilla Milkshake | 130 | Beverage | Classic vanilla milkshake |
| Junction Oreo Milkshake | 140 | Beverage | Milkshake blended with Oreo cookies |
| Junction Kesar Milk | 90 | Beverage | Saffron-flavored milk |
| Junction Buttermilk | 60 | Beverage | Spiced traditional buttermilk |
| Junction Rose Milk | 80 | Beverage | Rose syrup flavored milk |
| Junction Sweet Lime Juice | 80 | Beverage | Fresh sweet lime juice |
| Junction Grape Juice | 90 | Beverage | Fresh grape juice |
| Junction Papaya Smoothie | 120 | Beverage | Fresh papaya smoothie |
| Junction Guava Juice | 90 | Beverage | Fresh guava juice |
| Junction Avocado Smoothie | 140 | Beverage | Creamy avocado smoothie |
| Junction Spinach Detox Juice | 110 | Beverage | Spinach and fruit detox juice |
| Junction Ginger Lemon Shot | 60 | Beverage | Ginger and lemon immunity shot |
| Junction Aloe Vera Juice | 90 | Beverage | Fresh aloe vera juice |
| Junction Cucumber Mint Cooler | 90 | Beverage | Refreshing cucumber mint drink |
| Junction Jaljeera | 60 | Beverage | Spiced cumin and mint cooler |
| Junction Lassi Sweet Junction | 80 | Beverage | Sweet yogurt-based drink |
| Junction Lassi Salted Junction | 80 | Beverage | Savory yogurt-based drink |
| Junction Blueberry Smoothie | 140 | Beverage | Fresh blueberry smoothie |
| Junction Chikoo Shake | 120 | Beverage | Sapodilla fruit milkshake |
| Junction Fig Smoothie | 130 | Beverage | Fresh fig smoothie |
| Junction Dragon Fruit Juice | 120 | Beverage | Fresh dragon fruit juice |
| Junction Passion Fruit Juice | 120 | Beverage | Fresh passion fruit juice |
| Junction Herbal Immunity Shot | 70 | Beverage | Herbal wellness shot |
| Junction Iced Latte | 110 | Beverage | Chilled espresso with milk |

- [ ] **Step 3: Append these 48 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Juice Junction';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Juice Junction menu to 50 items"
```

---

## Task 16: Sweet Tooth — Desserts (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "red velvet cake slice" "cheesecake slice" "macarons plate" \
  "kaju katli sweet" "jalebi dessert" "ice cream sundae" "chocolate mousse" \
  "banana split dessert" "choco lava cake" "soan papdi"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Sweet Tooth Red Velvet Cake | 160 | Dessert | Classic red velvet layer cake |
| Sweet Tooth Black Forest Cake | 150 | Dessert | Chocolate cake with cherries and cream |
| Sweet Tooth Cheesecake | 170 | Dessert | Creamy baked cheesecake slice |
| Sweet Tooth Carrot Cake | 150 | Dessert | Spiced carrot cake with frosting |
| Sweet Tooth Vanilla Cupcake | 90 | Dessert | Classic vanilla frosted cupcake |
| Sweet Tooth Chocolate Cupcake | 90 | Dessert | Rich chocolate frosted cupcake |
| Sweet Tooth Macarons | 140 | Dessert | Assorted French macarons |
| Sweet Tooth Doughnut Glazed | 80 | Dessert | Classic glazed doughnut |
| Sweet Tooth Doughnut Chocolate | 90 | Dessert | Chocolate-frosted doughnut |
| Sweet Tooth Rasgulla | 90 | Dessert | Soft spongy cheese balls in syrup |
| Sweet Tooth Rasmalai Sweet Tooth Style | 110 | Dessert | Cottage cheese dumplings in sweet milk |
| Sweet Tooth Kaju Katli | 130 | Dessert | Cashew fudge diamonds |
| Sweet Tooth Motichoor Ladoo | 100 | Dessert | Fine gram-flour pearl sweet balls |
| Sweet Tooth Besan Ladoo | 100 | Dessert | Roasted gram flour sweet balls |
| Sweet Tooth Jalebi | 90 | Dessert | Crispy syrup-soaked spirals |
| Sweet Tooth Rabri Sweet Tooth Style | 120 | Dessert | Sweetened thickened milk |
| Sweet Tooth Gajar Halwa Sweet Tooth Style | 110 | Dessert | Sweet carrot pudding |
| Sweet Tooth Kheer Sweet Tooth Style | 100 | Dessert | Creamy rice pudding |
| Sweet Tooth Ice Cream Sundae | 140 | Dessert | Ice cream with toppings and syrup |
| Sweet Tooth Chocolate Fudge | 120 | Dessert | Rich dense chocolate fudge |
| Sweet Tooth Fruit Tart | 140 | Dessert | Pastry shell with fresh fruit |
| Sweet Tooth Lemon Tart | 130 | Dessert | Tangy lemon curd tart |
| Sweet Tooth Apple Pie Sweet Tooth Style | 140 | Dessert | Warm spiced apple pie |
| Sweet Tooth Pecan Pie | 150 | Dessert | Rich pecan pie slice |
| Sweet Tooth Waffle with Ice Cream | 160 | Dessert | Belgian waffle topped with ice cream |
| Sweet Tooth Pancake Stack | 140 | Dessert | Fluffy pancakes with syrup |
| Sweet Tooth Churros Sweet Tooth Style | 110 | Dessert | Fried dough with cinnamon sugar |
| Sweet Tooth Chocolate Mousse | 130 | Dessert | Light airy chocolate mousse |
| Sweet Tooth Tiramisu Sweet Tooth Style | 150 | Dessert | Coffee-soaked mascarpone dessert |
| Sweet Tooth Banana Split | 150 | Dessert | Classic banana split sundae |
| Sweet Tooth Caramel Custard | 110 | Dessert | Silky caramel egg custard |
| Sweet Tooth Cookies and Cream Shake | 140 | Beverage | Cookies and cream milkshake |
| Sweet Tooth Chocolate Brownie Sundae | 150 | Dessert | Brownie topped with ice cream |
| Sweet Tooth Milkshake Trio | 150 | Beverage | Three-flavor milkshake sampler |
| Sweet Tooth Peanut Butter Cookie | 80 | Dessert | Chewy peanut butter cookie |
| Sweet Tooth Oatmeal Cookie | 80 | Dessert | Chewy oatmeal raisin cookie |
| Sweet Tooth Chocolate Chip Cookie | 80 | Dessert | Classic chocolate chip cookie |
| Sweet Tooth Nutella Waffle | 160 | Dessert | Waffle topped with Nutella |
| Sweet Tooth Choco Lava Cake | 140 | Dessert | Warm cake with molten chocolate center |
| Sweet Tooth Coconut Ladoo | 90 | Dessert | Sweet coconut sugar balls |
| Sweet Tooth Coconut Barfi | 100 | Dessert | Dense coconut milk fudge |
| Sweet Tooth Kalakand | 100 | Dessert | Milk-based sweet fudge |
| Sweet Tooth Petha | 80 | Dessert | Translucent candied ash gourd sweet |
| Sweet Tooth Soan Papdi | 90 | Dessert | Flaky sweet gram-flour confection |
| Sweet Tooth Mango Mousse | 130 | Dessert | Light mango-flavored mousse |
| Sweet Tooth Strawberry Cheesecake | 170 | Dessert | Cheesecake topped with strawberry |
| Sweet Tooth Blueberry Muffin | 100 | Dessert | Soft muffin with blueberries |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Sweet Tooth';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand Sweet Tooth menu to 50 items"
```

---

## Task 17: The Bread Basket — Bakery (3 existing → 50 total, +47 new)

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 16 (includes Sweet Tooth's
  dessert names — this task's names are "Basket"-branded to avoid
  collision by construction, but still verify against the registry).
- This is the LAST task of this sub-project. After it, run the final
  full-restaurant verification below.

- [ ] **Step 1: Fetch dish photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "baguette bread" "bagel with cream cheese" "danish pastry" \
  "banana bread slice" "pretzel bakery" "cinnamon bun" "chicken puff pastry" \
  "club sandwich bakery" "olive bread loaf" "shortbread cookies"
```

- [ ] **Step 2: Read the registry, then add these 47 new products**

| Item | Price | Category | Description |
|---|---|---|---|
| Basket Baguette | 90 | Bread | Classic French baguette |
| Basket Multigrain Bread | 100 | Bread | Wholesome multigrain loaf |
| Basket Rye Bread | 100 | Bread | Dense traditional rye loaf |
| Basket Garlic Bread Basket Style | 110 | Bread | Toasted bread with garlic butter |
| Basket Focaccia Basket Style | 120 | Bread | Herb-topped Italian flatbread |
| Basket Chocolate Croissant | 100 | Pastry | Croissant filled with chocolate |
| Basket Almond Croissant | 110 | Pastry | Croissant filled with almond cream |
| Basket Danish Pastry | 100 | Pastry | Flaky pastry with fruit filling |
| Basket Blueberry Muffin Basket Style | 90 | Pastry | Soft muffin with blueberries |
| Basket Banana Bread | 100 | Pastry | Moist banana loaf cake |
| Basket Chocolate Chip Muffin | 90 | Pastry | Muffin studded with chocolate chips |
| Basket Bagel Plain | 70 | Bread | Classic plain bagel |
| Basket Bagel Sesame | 80 | Bread | Bagel topped with sesame seeds |
| Basket Cream Cheese Bagel | 100 | Bread | Bagel served with cream cheese |
| Basket Dinner Rolls | 70 | Bread | Soft buttery dinner rolls |
| Basket Pretzel | 90 | Bread | Salted soft pretzel |
| Basket Cheese Bread | 110 | Bread | Loaf baked with melted cheese |
| Basket Herb Bread | 100 | Bread | Loaf infused with fresh herbs |
| Basket Whole Wheat Loaf | 90 | Bread | Wholesome whole wheat bread |
| Basket Brioche Bun | 80 | Bread | Soft buttery brioche bun |
| Basket Apple Turnover | 100 | Pastry | Flaky pastry with spiced apple filling |
| Basket Custard Tart | 110 | Pastry | Creamy baked custard tart |
| Basket Fruit Danish | 110 | Pastry | Danish pastry topped with fresh fruit |
| Basket Caramel Cinnamon Bun | 120 | Pastry | Cinnamon roll with caramel glaze |
| Basket Walnut Bread | 110 | Bread | Loaf studded with walnuts |
| Basket Olive Bread | 110 | Bread | Loaf studded with olives |
| Basket Sundried Tomato Bread | 110 | Bread | Loaf with sundried tomato pieces |
| Basket Rustic Country Loaf | 100 | Bread | Crusty rustic artisan loaf |
| Basket Milk Bread | 90 | Bread | Soft fluffy Japanese-style milk bread |
| Basket Butter Cookies | 80 | Dessert | Classic buttery shortbread cookies |
| Basket Shortbread | 80 | Dessert | Crumbly traditional shortbread |
| Basket Chocolate Muffin | 90 | Pastry | Rich chocolate muffin |
| Basket Vanilla Muffin | 85 | Pastry | Classic vanilla muffin |
| Basket Cheese Croissant | 110 | Pastry | Croissant filled with melted cheese |
| Basket Spinach Puff | 90 | Snack | Flaky pastry with spinach filling |
| Basket Chicken Puff | 100 | Snack | Flaky pastry with spiced chicken filling |
| Basket Vegetable Puff | 90 | Snack | Flaky pastry with mixed vegetable filling |
| Basket Egg Puff | 90 | Snack | Flaky pastry with spiced egg filling |
| Basket Basket Special Sandwich | 150 | Sandwich | House-special deli sandwich |
| Basket Ham and Cheese Sandwich | 160 | Sandwich | Classic ham and cheese sandwich |
| Basket Veg Club Sandwich | 140 | Sandwich | Triple-decker vegetable club sandwich |
| Basket Grilled Cheese Basket Style | 130 | Sandwich | Toasted grilled cheese sandwich |
| Basket Pita Bread | 70 | Bread | Soft Middle Eastern flatbread |
| Basket Naan Basket Style | 70 | Bread | Bakery-style leavened flatbread |
| Basket Sourdough Toast | 90 | Bread | Toasted sourdough with butter |
| Basket Multiseed Crackers | 90 | Snack | Crunchy multiseed crackers |
| Basket Basket Special Pastry Box | 250 | Pastry | Assorted box of house pastries |

- [ ] **Step 3: Append these 47 names to the registry**

- [ ] **Step 4: Verify**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'The Bread Basket';"
```
Expect 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: expand The Bread Basket menu to 50 items"
```

---

## Task 18: Final verification — all 17 restaurants

**Files:** none — verification only.

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Verify every restaurant individually hits 50+**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "
select s.name, count(p.id) as item_count
from public.stores s join public.products p on p.store_id = s.id
where s.category_type = 'restaurant'
group by s.name order by s.name;
"
```
Expected: all 17 rows show 50 or more. Fix any restaurant falling short
before proceeding.

- [ ] **Step 3: Verify whole-app name uniqueness**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -t -A -c "select p.name, count(*) from public.products p group by p.name having count(*) > 1;"
```
Expected: empty result, EXCEPT the one pre-existing "Veg Fried Rice"
duplicate between Demo Kitchen and Wok This Way (documented in the spec
as out-of-scope, pre-dating this sub-project). Any other duplicate is a
real bug — trace which task introduced it and fix before proceeding.

- [ ] **Step 4: Live verify**

```bash
npm run dev &
sleep 5
```
Click into at least 4 restaurants spread across different cuisines and
confirm each shows 50+ real, distinct menu items with photos, prices, and
descriptions. Confirm existing dishes (e.g. Bangkok Bites' original Pad
Thai) are still present and unchanged. Place one test order to confirm
checkout still works against an expanded menu.

- [ ] **Step 5: Update MEMORY.md**

Record: Restaurant Menu Expansion (sub-project A of the 50-unique-items
redesign) complete — all 17 restaurants now carry 50+ menu items each
(existing items preserved, ~810 new dishes added), all names unique
app-wide via the new `item-name-registry.md`. Note sub-project B (Phase 3
redo: Grocery/Convenience/Alcohol) is next, and must dedupe the 3
categories' currently-shared 20-item catalogs per the spec's "keep 1
store, replace other 3" ruling before adding items to reach 50/store.

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record restaurant menu expansion completion (sub-project A)"
```
