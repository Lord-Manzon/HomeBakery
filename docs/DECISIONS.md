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

### 2026-08-13 — Merged a detailed UX design system into UI_UX.md, kept 5-tab nav

**Decision:** Replaced the skeletal `docs/UI_UX.md` with a much more
detailed screen-by-screen spec (screen states, interaction-weight patterns,
key flows, a full design-token system) sourced from a separate design
session. Kept the existing **5-tab** nav (Home, Orders, Production,
Ingredients, More) rather than adopting that session's proposed 4-tab
version (which folded Ingredients into More + contextual-only access).
**Why:** The detail and reasoning in the new spec was a real improvement
over the old doc and worth keeping wholesale. The 4-tab proposal was
reasonable on its own terms, but Ingredients already has a shipped,
working tab from Phase 1, and stock-checking is frequent/standalone enough
for a solo baker to justify its own tab rather than only contextual access
— not worth the rework for a marginal nav simplification.
**Reaffirmed 2026-08-15:** a second mockup again proposed folding
Ingredients into More and giving Recipes its own top-level tab. Same
reasoning as above still held — declined again. Corrected mockup (5-tab,
Recipes nested under variant editing) approved and used as the visual
reference for the Phase 4 UX spec.
**Follow-up (done 2026-08-15):** `src/theme/` had Phase 1's placeholder
color/spacing/typography values, not the tokens specified in `UI_UX.md`
section F — migrated, see the `2026-08-15 — Migrated src/theme/...` entry
below.

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
feel like "the security step is done" when exposure is actually a
separate setting.

### 2026-08-15 — Migrated src/theme/ from Phase 1 placeholders to the real design system

**Decision:** Replaced `src/theme/colors.ts` and `src/theme/typography.ts`
with values matching `docs/UI_UX.md` section F. Key names in both files
were kept identical to Phase 1's — only the underlying values changed —
specifically to avoid a breaking change across the 11 files already
importing these tokens (auth screens, nav shell, shared components).
`spacing.ts`/`radii` were left untouched, since Phase 1's values already
matched section F closely enough that changing them would've been
change for its own sake.
**Why:** Phase 1 shipped placeholder theme values before the design system
existed (tracked as an open follow-up in `UI_UX.md` since the 2026-08-13
merge). This closes that follow-up.
**Open items carried forward, not resolved by this change:**
- Nunito font (section F's target typeface) was deliberately NOT added —
  it requires a new dependency (`@expo-google-fonts/nunito` + `expo-font`)
  plus async font-loading logic at the app root, which needs its own
  stated reason and decision, not to ride along with a token-values-only
  update. Still using system fonts.
- Order-status colors for `Confirmed` and `Preparing` aren't actually
  defined anywhere in section F (which only specifies success/warning/
  danger + primary). Mapped as a best guess in `colors.ts` with inline
  comments flagging them as unreviewed — worth a real look once real
  order status chips are visible on-device.

### 2026-08-15 — Locked the Phase 4 Products & Variants UX spec

**Decision:** Added detailed screen-by-screen specs for the Products list,
New product, Product detail, Add/edit variant sheet, and the Phase 4
Recipe & costing placeholder to `docs/UI_UX.md` section E (items 5, 5a,
5b, 5c, 6). Two implementation-affecting calls made in the process:
- The variant's serving/yield note (e.g. "Serves 8"), shown in an AI-built
  mockup, has no dedicated column in `docs/DATABASE.md`'s
  `product_variants` table. Folded into the variant's `name` field (e.g.
  `"Medium — Serves 8"`) rather than adding a new column, to avoid an
  unplanned schema change. Revisit if this reads awkwardly in practice.
- Product detail navigation uses a real Expo Router route
  (`/more/products/[id]`), not the inline same-screen expansion shown in
  the reference mockup — needed for back-button/deep-link/loading-state
  behavior required by `docs/CODING_STANDARDS.md`.
**Why:** `docs/AGENTS.md`'s process requires UX to be designed before
implementation starts; this closes that step for Phase 4 specifically.
**Note:** `suggested_price` is explicitly NOT a field in the variant sheet
— it's a Phase 6 calculated value (`cost ÷ (1 − margin%)`), never
hand-typed. `packaging_cost` IS in the Phase 4 sheet, since it's a plain
number the baker enters directly, no calculation involved.

### 2026-08-15 — Added a baker-customizable theme (accent color + light/dark/system)

**Decision:** Bakers can choose an accent color from a curated set of 6
swatches (Terracotta, Berry, Ocean, Sage, Plum, Honey) plus a display mode
(Light / Dark / Match device), via a new Appearance screen under More.
Added `theme_accent` and `theme_mode` columns to `bakers`
(`supabase/migrations/0003_baker_theme_preference.sql`), a `ThemeContext`
provider (`src/theme/ThemeContext.tsx`) computing a full palette from the
chosen accent + mode (`src/theme/palettes.ts`), and wired it into
`app/_layout.tsx` and `app/(tabs)/_layout.tsx`.
**Why:** Requested as a feature. Scoped to accent-only (not a full custom
color picker) because the app's fixed neutrals and semantic colors
(success/warning/danger) were tuned for contrast against specific accent
tones — an arbitrary baker-chosen hex risks poor readability or a status
chip that no longer reads as intended. A curated set keeps every
combination safe.
**Scope/rollout note:** This is additive, not a retrofit. Only screens
built from 2026-08-15 onward use the reactive `useThemeColors()` hook
(currently: the Appearance screen and the tab bar). Screens built before
this date keep using the static `colors` import and are unaffected —
migrating them to be theme-reactive is a separate, later cleanup pass, not
done as part of this change. Phase 4 (in progress) is being built against
`useThemeColors()` from the start, per the update brief sent alongside
this decision.
**Alternatives considered:** Full free-form color picker — rejected for
the contrast-safety reason above; can revisit if the curated set feels
too limiting in practice.

### 2026-08-15 — Locked the Phase 5 Ingredients & Inventory UX spec

**Decision:** Added detailed screen-by-screen specs for the Ingredients
list, detail, Restock, Use/waste, and Add/edit ingredient screens to
`docs/UI_UX.md` section E item 4. Visual reference: a provided mockup
(`Inventory-Variant-C-MoreComplete.html`), corrected to the locked 5-tab
nav — the mockup itself proposed folding Ingredients into More, declined
for the same reasons as the earlier Products mockup correction.
**Implementation-affecting decisions made in the process:**
- Three baker-facing actions (Restock / Use-waste / Edit-quantity) map to
  the four `inventory_movements.movement_type` values. The Use/Waste
  sheet's reason list is "Used in production," "Wasted," "Spoiled" only —
  "Other" was considered and dropped as too ambiguous to map to a
  movement type. No separate "Adjust stock" button exists; editing an
  ingredient's quantity directly IS the adjustment action.
- Added `ingredients.category` (nullable text, same free-text pattern as
  `expenses.category`) — see `supabase/migrations/0004_ingredient_category.sql`.
  Not in the original `docs/DATABASE.md` schema; added because the
  reference mockup used it and it was confirmed as wanted.
- Restock's cost-per-unit recalculation uses a **weighted average**
  (blends existing stock's cost with the new purchase), not a simple
  replace. This is real business logic requiring a Jest unit test per
  `docs/CODING_STANDARDS.md`, not just a UI field.
- No supplier field — an earlier draft of `docs/UI_UX.md`'s Ingredients
  section mentioned one, but no supplier column exists in
  `docs/DATABASE.md` and the reference mockup doesn't have one either.
  Treated as superseded, not built.
**Why:** `docs/AGENTS.md` requires UX to be designed before
implementation starts; this closes that step for Phase 5.


### 2026-08-18 — Products list gets a FAB (bottom-right), replacing the top-right "+" icon

**Decision:** The Products list's primary "add" action moved from a
top-right `+` icon (as originally specified in `docs/UI_UX.md` section
E.5) to a floating action button (FAB), bottom-right — the same 56px
circular pattern already shipped on the Ingredients tab.
**Why:** During a UI/UX polish pass on the Products flow, matching the
FAB already used on Ingredients gives the app's two "browse a list,
quickly add one" screens the same interaction pattern instead of two
different ones for the same job. The original top-right `+` spec predates
the Ingredients FAB; the mismatch was flagged rather than resolved
silently, and explicitly approved by the project owner in favor of
matching Ingredients over keeping the icon spec as originally written.
**Alternatives considered:** Keep the top-right `+` as originally
specified — not wrong on its own, just inconsistent with what Ingredients
already shipped.
**Doc impact:** `docs/UI_UX.md` section E.5 updated to describe the FAB
instead of the `+` icon.

### 2026-08-18 — Fixed static (light-only) color references breaking dark mode in `Screen` and the tab bar

**Decision:** `src/components/Screen.tsx` and `app/(tabs)/_layout.tsx`
were switched from the static `colors` export to the `useThemeColors()`
hook, matching every other themed component.
**Why:** Both were written before the 2026-08-15 accent/dark-mode theme
system and never migrated, so their background/tint colors stayed locked
to the light palette even in Dark mode while surrounding cards and text
correctly re-themed — producing dark cards floating on a still-light
background and tab bar. This is a bug fix restoring the intended
2026-08-15 behavior, not a new design decision.
**Follow-up:** Other screens outside the Products flow haven't been
audited for the same static-import bug; worth a dedicated sweep later.