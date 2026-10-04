# Task 11 fix: expose option ids from get_item_options
- Added pure `optionGroupViews` (+ types) to lib/zippy/catalog.ts; catalog-data.ts now selects `id` and uses it. Output options are `{id, name, extra_price}`.
- tools.ts get_item_options description now says each option has an id to pass as option_ids to propose_add_to_cart. prompt.ts needed no change.
- Test added in tests/zippy-catalog.test.mjs (ids paired with right group, sanitization kept).
- node --test: 247 pass, 0 fail. tsc --noEmit silent.
- Not verified live (needs running stack).
