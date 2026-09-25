Read `md_version/HANDOFF_1.md`, `CLAUDE.md`, `MEMORY.md`, and
`docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md` (all
at the repo root / docs/superpowers/specs/) before doing anything else —
they contain the full context of what's already built (Phases 1-3,
complete and merged to `main`) and the decisions/lessons that should
shape what comes next.

Once you've read those, continue the FoodHub build with **Phase 4 —
Restaurant/vendor panel** (spec §7): vendor login, menu CRUD, incoming
order queue, accept/prepare/ready status controls.

Follow the same cycle used for Phases 1-3: brainstorm any open questions
first (this phase will likely need a few — e.g. does vendor login reuse
the existing customer auth pattern or need its own, how does a vendor
get associated with their restaurant, what's the menu-item image-upload
story now that Phase 2 already wired Pexels-sourced images into seed
data), then write a detailed implementation plan with
`superpowers:writing-plans`, then execute it with
`superpowers:subagent-driven-development` in an isolated git worktree,
ending with a final whole-branch review and a merge to `main`.

Before Docker/Supabase commands will work, remind me to have Docker
Desktop running, and recreate `.env.local` from the running Supabase
stack's printed values (steps are in HANDOFF_1.md) since it's gitignored
and won't exist in a fresh session/worktree.

Update `CLAUDE.md`, `MEMORY.md`, and `README.md` as you go, same as the
prior three phases did — and when this phase is done, write a
`HANDOFF_2.md` (and `KICKOFF_2.md` if I ask to continue further) into
`md_version/` the same way this one was written.
