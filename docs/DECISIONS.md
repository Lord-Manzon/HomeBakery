# HomeBakery — Decision Log

Each entry: what was decided, why, what else was considered. Full technical
reasoning lives in ARCHITECTURE.md and DATABASE.md — this is the running
index of *when and why things changed*. Add a new entry any time a meaningful
product or technical decision is made or changed; don't edit history, append.

---

### 2026-08-12 — Restarted the project from scratch

**Decision:** Abandon the previous HomeBakery implementation entirely.
New repo, no assumption that prior code, architecture, dependencies, or UI
decisions are correct.
**Why:** Previous implementation had an unresolved NativeWind-related Android
crash; rather than keep debugging a specific broken build, start clean with a
safer styling approach.

### 2026-08-12 — No NativeWind; use React Native's built-in `StyleSheet`

**Decision:** Styling uses `StyleSheet.create()` + a shared `theme.ts` design
tokens file. NativeWind is banned from this project.
**Why:** NativeWind's build-time code generation caused a hard-to-diagnose
Android runtime crash in the previous project that survived multiple rounds
of debugging. Plain `StyleSheet` has no code-generation step and nothing to
go out of sync with Expo/RN versions.
**Alternatives considered:** styled-components, styled-system, Tamagui — all
carry a similar runtime style-resolution or compiler layer, the exact
category of risk being avoided.

### 2026-08-12 — Expo SDK 57 / Expo Router / TanStack Query / React Hook Form + Zod / Supabase

**Decision:** See ARCHITECTURE.md for full reasoning on each.
**Why (short version):** Expo for a managed, stable build pipeline; Expo
Router because it's React Navigation under the hood with less boilerplate and
is the current default; TanStack Query because almost all app state is
server data from Supabase; React Hook Form + Zod for forms/validation that
can't drift from their TypeScript types; Supabase for Postgres + Auth +
Storage + RLS in one place.

### 2026-08-12 — Costing and pricing live on the product **variant**, not the product

**Decision:** `selling_price`, `recipe_portion`, and `packaging_cost` are all
fields on `product_variants`, not `products`.
**Why:** Different sizes of the same product (e.g. Small/Medium/Large Carrot
Cake) use different amounts of a recipe, different packaging, and have
different prices — putting these on the product itself couldn't represent
that.

### 2026-08-12 — Recipes are independent records, referenced by variants

**Decision:** A `recipe` doesn't belong to one product/variant; a `variant`
references a `recipe_id` plus a `recipe_portion` (how much of one batch it
uses).
**Why:** Lets one recipe (e.g. a base vanilla sponge) be reused across
multiple products/variants instead of being duplicated per variant.

### 2026-08-12 — Production is a view over `order_items`, not its own table

**Decision:** No standalone `production_batches`/`production_tasks` table for
MVP. `order_items.production_status` (`pending`/`done`) drives the Production
screen; the screen groups items by `scheduled_date`.
**Why:** Avoids keeping two records of the same thing in sync. Revisit if a
future need (e.g. baking ahead of confirmed orders) doesn't map to order
items.

### 2026-08-12 — Margin can be overridden below the baker default

**Decision:** `bakers.default_margin_percent` is the fallback. `recipes`,
`products`, and `product_variants` can each optionally set their own
`margin_percent`. Resolution order (most specific wins):
variant → product → recipe → baker default.
**Why:** Keeps setup fast for a baker who's fine with one margin across the
board, while allowing a specific item (e.g. an ingredient-heavy recipe, or a
premium variant) to need a different margin without changing the baker's
overall default.

### 2026-08-12 — Carried-forward navigation/UX is a proposal, not a locked decision

**Decision:** The nav structure and feature designs from earlier sessions
(Home, Orders, Production, Ingredients, Products) stay as the working
starting point, but are explicitly open to revision as each feature is
designed in detail — not treated as final just because they were decided
before the restart.
**Why:** The restart is meant to re-evaluate everything, UX included, rather
than blindly carry over prior decisions.

### 2026-08-12 — Pin `@react-native-async-storage/async-storage` to `2.2.0`

**Decision:** Exact version `2.2.0`, not a caret range.
**Why:** Versions after `2.2.0` changed the library's native storage backend
in a way that's currently broken with Expo/Expo Go — the native module loads
as `null` at runtime ("Native module is null, cannot access legacy storage"),
confirmed as a known, open compatibility issue upstream, not something
specific to this project or machine. `2.2.0` is the last version confirmed
working. This is why it's pinned exactly rather than with `^`/`~` — a
routine `npm install` picking up a newer patch would silently reintroduce
the crash.
**Revisit:** check for a fixed release before ever bumping this package.

### 2026-08-12 — `.npmrc` with `legacy-peer-deps=true`, to work around an Expo SDK 57.0.12 upstream inconsistency

**Decision:** Project root `.npmrc` sets `legacy-peer-deps=true`.
**Why:** `expo-router@57.0.12` bundles web-devtools packages (`@expo/ui`,
`vaul`, Radix UI) that pull in `react-dom@19.2.8`, which requires
`react ^19.2.8` — but the SDK 57 template itself pins `react` to exactly
`19.2.3`. Without this setting, `npm install`/`npm ci` fail with an
ERESOLVE error unpredictably (it depends on dependency-resolution order,
so it can appear to work once and then fail on a clean machine). The
mismatched packages are dev-tooling only, not part of what ships to
Android/iOS, so relaxing peer-dependency strictness here is safe.
**Revisit:** check on the next Expo SDK version bump whether this has been
fixed upstream; remove the `.npmrc` override if so.

### 2026-08-12 — Storefront writes go through database functions, not direct table access

**Decision:** Anonymous (`anon`) access is limited to two Postgres functions
(`get_storefront`, `submit_storefront_order`) rather than RLS-opened table
access.
**Why:** Keeps exactly what an anonymous visitor can read/write narrow and
explicit, rather than relying on RLS policies to correctly restrict every
column on every storefront-adjacent table.

### 2026-08-15 — All Phase 3 tables exposed via Data API; disabled auto-expose for new tables

**Decision:** After running the Phase 3 migration, manually exposed all 11
new tables (`ingredients`, `recipes`, `recipe_ingredients`, `products`,
`product_variants`, `orders`, `order_items`, `inventory_movements`,
`expenses`, `storefront_settings`, `subscriptions`) in Project Settings →
API → Exposed tables, alongside `bakers` (already exposed from Phase 2).
Also turned off "Automatically expose new tables."
**Why:** Table exposure and RLS are separate, independent settings in
Supabase — RLS controls *what* a request is allowed to see once it reaches
a table, but exposure controls whether the table is *reachable* through the
Data API/REST at all. A newly created table isn't usable by the app until
it's explicitly exposed, regardless of its RLS policies. Disabling
auto-expose means every future migration requires a conscious, visible step
to make a new table reachable — consistent with `AGENTS.md`'s "nothing gets
added without a stated reason" approach, rather than a table silently
becoming API-reachable the moment it's created.
**Follow-up:** Every future migration that adds a table must include a
manual exposure step in its checklist — easy to forget since RLS setup can
feel like "the security step is done" when exposure is actually