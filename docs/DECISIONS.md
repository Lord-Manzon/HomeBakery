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


### 2026-08-18 — Product categories get their own table, with a baker-chosen icon per category

**Decision:** New `product_categories` table (`id`, `baker_id`, `name`,
`icon`, `created_at` — see `supabase/migrations/0007_product_categories.sql`),
created via a dedicated full-screen "New category" flow (name + a
10-icon curated grid, reached via a "+ New" chip). `products.category`
stays plain text, unchanged — it's matched against this table by name
at render time, not linked by a foreign key. Category quick-pick chips
on New Product (and the Products list filter row) now read from this
table instead of being derived from distinct values already in use on
existing products, so a category can exist — and show its icon — before
any product actually uses it.
**Color is not stored.** It's derived by hashing the category name into
one of the app's 6 existing curated accent swatches (now shared via the
new `src/theme/accentSwatches.ts`, extracted out of `appearance.tsx`),
so the same name always renders the same color with nothing extra
persisted, consistent with the 2026-08-15 "curated colors only"
precedent from the Appearance screen.
**Why:** The baker wanted to deliberately choose an icon per category
(shown in chips, filters, and the product detail category pill), which
free text alone can't carry — that choice needs to persist and be
looked up wherever the category name shows up again.
**Alternatives considered:** A static enum → icon lookup, the pattern
already used for Ingredient categories (`src/utils/ingredientCategoryIcon.ts`)
— rejected because Ingredient categories are a small fixed dropdown,
while Product categories are free text/open-ended; a static map can't
cover an unbounded set of baker-typed names.
**Manual step required after migrating:** per the 2026-08-15 "disabled
auto-expose" decision, `product_categories` had to be manually exposed
in Supabase Dashboard → Project Settings → API → Exposed tables.
**Doc impact:** `docs/DATABASE.md`'s table list and `docs/UI_UX.md`
section E updated (see below).

### 2026-08-18 — Category chips: long-press to wiggle, tap × to delete (with confirm)

**Decision:** On New Product's category chips, a long-press on any chip
enters an editing state — every chip wiggles and grows a small × badge
(iOS-homescreen-style), with a "Done" link next to the section label to
exit. Tapping × opens the existing shared `ConfirmDialog` (not an
instant delete) before removing the category.
**Why:** `docs/CODING_STANDARDS.md` requires a confirmation step before
any destructive action — every other delete in the app (variant
removal, product deactivation) already goes through `ConfirmDialog`, so
this stays consistent rather than being the one silent-delete exception.
**Behavior worth remembering:** deleting a `product_categories` row does
**not** touch any product already carrying that name in its plain-text
`products.category` field — that product keeps the category name, it
just falls back to the default icon (`getCategoryVisual`'s fallback)
since there's no longer a matching row. This is a direct consequence of
category being matched by name rather than foreign-keyed, per the
entry above.

### 2026-08-18 — Product name is editable inline from Product Detail

**Decision:** Tapping the product name in the Product Detail header
turns it into an editable text field (pencil icon signals it's
tappable); committing (blur or keyboard "Done") saves via the same
`useUpdateProduct` mutation the photo-upload feature already used.
**Why:** There was previously no way to fix a product name typo without
deleting and recreating the product.
**Implementation note:** `updateProduct`'s service function always
expects the full `{name, category, image_url}` payload, so the name-save
call explicitly re-sends the product's existing `category` and
`image_url` alongside the new name — sending `{name}` alone would have
silently cleared the other two fields. Worth remembering if more
inline-editable fields get added to this screen later.

### 2026-08-18 — Products list moves from a list-row layout to an image-forward grid, adds sort

**Decision:** The Products list card pattern changed from the standard
"List row card" (per the Components table in `docs/UI_UX.md`, previously
shared with Orders/Expenses/Ingredients) to a 2-column grid of cards
with a large top-anchored photo, name, and up to 2 variant chips (+"N
more"). The "Tap a product to see its variants" helper line was
removed. A new sort control (icon left of search: Name A–Z / Z–A /
Newest first) was added, using the same dismiss-on-outside-tap dropdown
pattern as the Product Detail overflow menu.
**Why:** The baker's product photos are a meaningful part of deciding
what to tap into (unlike, say, an expense row), and the previous 56×56
thumbnail undersold that. The helper line became redundant once the
UI itself (photos, chips) made the screen's purpose self-evident.
**Alternatives considered:** Keeping the List row card pattern with a
larger thumbnail — considered simpler/more consistent with the rest of
the app, but didn't give photos enough visual weight to work as the
primary way of recognizing a product at a glance.
**Doc impact:** `docs/UI_UX.md`'s Components table and section E.5
updated (see below) — Products is now the one exception to the List row
card pattern; Orders/Expenses/Ingredients are unaffected and keep it.

### 2026-08-16 — Two Phase 5 interaction patterns changed after on-device testing

**Decision 1 — Restock moved from full-screen to a bottom sheet.**
The original spec (docs/UI_UX.md section E.4.3) classified Restock as
full-screen, following the interaction-weight table's "many fields → full
screen" rule. In practice it only has 2 fields (quantity, optional total
cost paid) — closer to the "2-4 fields → sheet" bucket than the original
call anticipated. Changed to a bottom sheet (src/components/RestockSheet.tsx),
matching Add/Edit ingredient and Use/Waste.

**Decision 2 — Ingredient delete uses a popup modal, not inline-confirm.**
docs/UI_UX.md's default pattern for deletes across the app is inline-confirm
(the trigger button swaps to Cancel/Confirm in place) — reserving modal
dialogs for "irreversible, high-stakes actions only." Ingredient deletion
is being treated as one of those exceptions: it also deletes the
ingredient's full stock/movement history, which is more consequential than
deleting a single order or expense line. Uses a new reusable
src/components/ConfirmDialog.tsx.

**Why both changed together:** both surfaced during the same round of
on-device testing, driven by how the built screens actually felt to use
rather than a spec re-read. Recorded here rather than silently — per
docs/AGENTS.md, a deviation from a locked spec is still a decision, even
when it's a UI-feel call rather than a technical one.

**Also fixed this session (bugs, not decisions):**
- `app/_layout.tsx` computed a theme preference but never actually wrapped
  `<Stack>` in `<ThemeProvider>` — the whole theme feature was silently
  inert. Fixed.
- Category/unit chips in `IngredientFormSheet.tsx` weren't rendering —
  root cause was `gap` combined with `flexWrap: 'wrap'`, a known
  Android/Yoga rendering issue in some RN versions. Switched to
  margin-based chip spacing. Confirmed fixed on-device.
- `BottomSheet.tsx` rebuilt: backdrop fade decoupled from sheet slide
  (previously both animated together via `Modal`'s built-in
  `animationType="slide"`, causing the dim to visibly "rise" with the
  sheet); added real drag-to-dismiss via `PanResponder`, isolated to a
  padded handle-bar area so it doesn't compete with the sheet's internal
  `ScrollView` for touch events.
- Root cause of an earlier full-app crash on launch was a Java 25 vs. 17
  mismatch on the dev machine breaking the native Android build —
  unrelated to any app code. Resolved by installing Java 17; testing has
  since moved from Expo Go to a real `npx expo run:android` dev build.

  ### 2026-08-16 — Added a baker-customizable stock gauge (Tight/Balanced/Relaxed) to Ingredients

**Decision:** The Ingredients list and detail screen now show a visual
stock bar (`StockGauge`) next to each ingredient's numbers, instead of
only the current-stock number and a low-stock badge. How "full" the bar
reads is controlled by a baker-level `gauge_sensitivity` preference
(`tight` / `balanced` / `relaxed`, default `balanced`), set via a new
sheet reached from an icon in the Ingredients header. Added
`bakers.gauge_sensitivity` (`supabase/migrations/0004_baker_gauge_sensitivity.sql`),
gauge math in `src/services/stockGauge.ts`, and the `StockGauge` /
`GaugeSensitivitySheet` components.

**Why a multiplier off `low_stock_threshold`, not a separate `max_stock`
column:** the gauge's "full" ceiling is computed on the fly as
`low_stock_threshold × multiplier` — no new per-ingredient field to keep
in sync, and a baker who's already set a low-stock alert automatically
gets a working gauge with no extra setup. Ingredients with no threshold
set show a neutral "Set a low-stock alert to track this" hint instead of
a fabricated bar.

**Why 3 curated presets, not a free-form multiplier:** same reasoning as
the accent-color picker (2026-08-15 entry) — a handful of understood,
safe options beats an arbitrary number nobody can reason about.
- **Tight (×2):** bars read full sooner — less advance warning before hitting the low-stock line.
- **Balanced (×3, default):** a fair runway between "full" and the alert line for a typical restock cadence.
- **Relaxed (×4):** more gradual decline visible, takes longer to look full again right after a restock.

**Alternatives considered:** a free-form "set your own ceiling"
number — rejected for the same reason a free-form accent color was:
too easy to pick a value that makes every gauge either always-full or
always-empty, with no guardrail.

**Also bundled into this change (see UI_UX.md update below for full
detail):**
- A category filter (horizontal chip row) added to the Ingredients list —
  not in the original Phase 5 spec, added because the gauge redesign
  already restructured that screen's header area.
- `PrimaryButton` gained a `variant?: 'primary' | 'secondary'` prop, used
  so Restock (primary) and Use/waste (secondary) on the ingredient detail
  screen no longer show as two competing filled buttons — closes a real
  violation of `UI_UX.md`'s "one filled button per screen max" rule that
  existed before this change.
- Ingredient detail's stock-history rows now show a small icon per
  movement type (restock/usage/waste/adjustment) instead of text alone.

**Reconciling an earlier undocumented change:** `RestockSheet` was
changed from a full-screen form to a bottom sheet on 2026-08-15 (visible
in a code comment) but that change was never reflected in `UI_UX.md`,
which still describes Restock as "full screen: quantity purchased, cost,
optional supplier." This entry also closes that gap — see the corrected
row in the Interaction weight table in `UI_UX.md`.

**Not done as part of this change:** Jest still isn't installed in this
project (no `jest` binary, no `@types/jest`, no `test` script) — both the
pre-existing `ingredients.test.ts` and the new `stockGauge.test.ts` exist
as real test files but can't currently run. Adding a test runner is its
own dependency decision and hasn't been made yet.

**Testing status:** verified with `npx tsc --noEmit` against the real
project — zero errors outside the pre-existing Jest-not-installed test
files. **Not yet tested on an Android device build** — required before
this is considered done, per `ARCHITECTURE.md`'s local dev/testing rule.

### 2026-08-17 — Reopened: product categories are now MVP (free text, dynamic chips)

**Decision:** Added `products.category` — nullable free text, no fixed
list, same pattern as `ingredients.category`/`expenses.category`. Products
list shows a category filter chip row (always "All" first) generated
dynamically from the distinct category values currently in use across the
baker's own products, not from a separately stored/curated list. A product
with no category set shows under "All" only, with no chip of its own.
**Why:** A Phase 4 reference mockup (AI #2) made a real case for category
filtering on the Products list; the previous "Later, not MVP" call
(`docs/PRODUCT.md`, `docs/DATABASE.md`) is explicitly reopened here rather
than silently overridden. `docs/PRODUCT.md` and `docs/DATABASE.md` updated
alongside this entry.
**Alternatives considered:** a fixed category list (`Ingredients`-style
enum) — declined, since product categories are more bakery-specific/
personal (e.g. "Pasalubong," "Holiday specials") than ingredients' small
universal set, and a free-text/dynamic pattern avoids introducing a third
categorization convention into the app on top of the two that already
exist.
**Also decided in the same conversation:** Products list cards show each
variant as its own price chip inline (e.g. "Small ₱450 · Medium ₱850"),
**replacing** the `docs/UI_UX_1.md` section E.5-locked "`N` variants ·
`min`–`max` price range" summary-line format — another Phase 4 mockup
(AI #2) driven reversal of an already-locked spec, same category of change
as the 2026-08-15 Restock sheet reversal. `docs/UI_UX_1.md` section E.5
needs a follow-up edit to match — not done as part of this entry, tracked
as open.
**Migration:** `supabase/migrations/0005_product_category.sql` (nullable
column, no backfill needed, no RLS change — `category` follows the
existing `products` table policies).
**Follow-up:** `products` is already exposed via the Data API (covered by
the 2026-08-15 "All Phase 3 tables exposed" entry) — adding a column to an
already-exposed table doesn't require a new exposure step, only the
migration itself.

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


### 2026-08-19 — Reverted to 4-tab nav (Ingredients folded into More), floating
pill nav + FAB with scroll-to-hide, and a contextual Quick Add popup card

**Decision:** Bottom nav changes from a 5-tab fixed bar to a 4-tab floating
pill (Home · Orders · Production · More) with a separate floating + button
beside it — both hover above content rather than spanning the screen width,
and both slide down + fade out together on scroll-down, reappearing on
scroll-up. Ingredients moves under More (browsable list/detail, same as
Products). Tapping + opens a small popup card anchored bottom-right, directly
above the FAB — not a full-width bottom sheet — listing 1–4 actions
contextual to the current tab, top item visually weighted. The card
auto-closes if the nav hides mid-open (scrolling away), so there's never a
floating card with no visible FAB to dismiss it from. This supersedes the
5-tab decision from 2026-08-13 (reaffirmed 2026-08-15) — not rewritten, but
no longer current.

**Why floating + scroll-hide:** maximizes visible content on data-dense
screens (Ingredients, Orders, Reports, Products) while keeping the same
one-handed reachability everywhere else in the app already relies on.

**Why a popup card over a full bottom sheet or radial fan:** evaluated
three options — radial fan (rejected: harder to guarantee the 44×44px
touch-target minimum per UI_UX_1.md section F, and more custom motion code
than a "fast, boring add action" warrants, per ARCHITECTURE.md's
simplicity-over-trendiness priority), expanding horizontal row (rejected:
cramped with 4 items + labels on narrow phones, doesn't scale to a 5th
item), and the popup card (chosen: same vertical icon+label list pattern
already used everywhere else, e.g. bottom sheets — least new pattern to
learn, easiest to keep accessible).

**Per-tab Quick Add contents:** unchanged from the entry above — Home (Add
order, Add ingredient, Add product, Add expense), Orders (Add order only),
Production (Add order, Restock ingredient, Add expense — no "create
production" action, production has no creatable entity), More (Add product,
Add ingredient, Add recipe, Add expense).

**Implementation note:** requires a custom nav shell (Expo Router's default
tab bar doesn't support floating/scroll-reactive behavior) — every
scrollable screen needs to report scroll direction up to the same shared
show/hide logic, not just Home. Flagged as a real build cost, not a config
tweak.

**Follow-up:** `docs/UI_UX_1.md` sections B, C, E, and the new section G are
updated in this same change.


### 2026-08-21 — Recipe instructions become step-based; header delete replaces bottom link; dedicated full-screen editor

**Decision:** `recipes.instructions` changes from a single `text` block to a
`jsonb` array of step strings (`supabase/migrations/0008_recipe_instructions_steps.sql`).
A free-text recipe is simply a 1-item array under the new shape — no data
lost, existing values were backfilled automatically. Recipe Detail gains a
new Instructions card (empty-state prompt if none exist, preview + edit
link if they do), and editing happens on a new dedicated screen
(`app/(tabs)/more/recipes/[id]/instructions.tsx`) with two modes: "Steps"
(numbered rows, add/remove) and "One block" (single textarea, saves as a
1-item array) — not a bottom sheet.

Also, on Recipe Detail: the header's edit-pencil icon is replaced with
tap-the-name-to-edit (mirrors the 2026-08-18 "Product name is editable
inline" pattern — tap opens an inline text field, blur/Done commits). The
icon slot that used to hold the pencil now holds a delete (trash) icon,
which opens an inline confirm banner directly under the header. The
previous "Delete recipe" text link + confirm block at the bottom of the
screen is **removed** — there was no reason for two delete triggers doing
the same thing on one screen.

New Recipe's free-text Instructions field is removed from that form
entirely; instructions are now only added/edited from Recipe Detail's new
Instructions card, after the recipe exists. New Recipe's yield fields are
reframed from two generic-labeled boxes ("Yield quantity" / "Yield unit")
into a single guided line ("This recipe makes ___ of ___") — the old
layout gave both fields equal visual weight, which is how a baker ended up
typing a number into the unit field (e.g. "1", saved before
`recipeSchemas.ts`'s existing anti-numeric-unit validation existed),
producing card text like "Yields 1 1".

**Why:** A baker read as "Yields 1 1" on the Recipes list, traced to two
issues: (1) `recipeSchemas.ts` already blocks a numeric yield unit going
forward — the malformed data was legacy, not a live bug — but the form
still didn't make it obvious why quantity and unit are separate fields,
which was worth fixing anyway; and (2) instructions were never viewable or
editable from Recipe Detail at all, so a baker who skipped them at
creation (an optional field) had no way back in. A single free-text box
also doesn't fit how a baker actually thinks through a recipe — as steps —
so the editor supports genuine step-by-step entry rather than one
paragraph.

**Why a full-screen editor, not a bottom sheet:** per `UI_UX_1.md`
section B's interaction-weight table, sheets are for 2–4 quick,
dismissible fields (Add expense, Add/edit variant) — not a
variable-length list of multiline steps a baker wants to read back and
edit carefully. There's also a concrete precedent to avoid: the
2026-08-16 entry documents real Android keyboard-handling pain inside
`BottomSheet.tsx`; a dynamically growing list of text inputs inside a
sheet is exactly the scenario most likely to reproduce that class of bug.
A full-screen route sidesteps it, the same way New Recipe already does.

**Alternatives considered:** Keeping a plain textarea on New Recipe
alongside the new step editor — rejected to avoid maintaining two
different instruction-editing UIs for the same field. Header delete
icon jumping to the existing bottom confirm instead of replacing it —
rejected as pointless indirection once the header can hold the action
directly.

**Doc impact:** `docs/DATABASE.md`'s `recipes.instructions` row updated
(see below). `docs/UI_UX_1.md`'s Recipe & costing section (E.6) is **not**
updated as part of this change — it already describes Phase 4's
placeholder screen, not the standalone Recipes list/detail flow that's
actually built, and rewriting that gap properly is separate work, not a
side effect of this fix. Still open, flagged here again so it isn't lost.

### 2026-08-21 — Floating nav hides on full-screen, single-purpose routes

**Decision:** The floating pill nav + FAB (2026-08-19 entry) now hides
itself entirely — not just on scroll — while any full-screen,
single-purpose route is on top of the stack: New Product, New Category,
New Recipe, Recipe Instructions editor, Restock. It stays visible on
browse/detail-style screens: Product Detail, Recipe Detail, Ingredient
Detail, Recipe & Costing, and all list screens.

**Why:** The nav was rendered once at the (tabs) layout level, so it kept
floating over every nested screen in every tab, including full-screen
forms that already pin their own primary Save button at the bottom —
producing visual overlap and contradicting `UI_UX_1.md` section B's own
interaction-weight distinction between focused full-screen forms and
browse screens. Quick Add's contents (tab-level actions like "Add
ingredient") also stop being relevant once a baker is deep inside editing
one specific record.

**Implementation:** `ScrollNavContext` gained a second shared value,
`forceHiddenCount` — a mount-count rather than a boolean, so a screen
stacked on top of another still-mounted full-screen route doesn't
prematurely reveal the nav when it unmounts. Screens opt in via
`useHideFloatingNav()`, called once at the top of the component.

**Follow-up:** `docs/UI_UX_1.md` section G updated to state this
distinction explicitly, rather than leaving "which screens the global nav
covers" implicit.

### 2026-08-22 — Simplified orders.status to 4 values; payment_method is now free text

**Decision:** `orders.status`'s original 6-value design
(`pending`/`confirmed`/`preparing`/`ready`/`completed`/`cancelled`) is
reduced to 4: `pending` / `delivered` / `completed` / `cancelled`
(`supabase/migrations/0009_orders_status_payment_method.sql`). New
lifecycle: `pending` → `delivered` → `completed`, or `cancelled` (from
`pending` or `delivered`, not from `completed`). **`completed` is never
set directly by a baker action** — it's a derived side effect, applied
automatically the moment an order is both `delivered` and
`payment_status = 'paid'`, whichever happens last
(`src/services/orderLogic.ts`'s `resolveStatusAfterMarking`). Order Detail
exposes exactly two quick actions — "Mark Delivered"/"Mark Picked Up"
(label depends on `fulfillment_type`) and "Mark Paid" — plus a separate
"Cancel order" inline-confirm action, rather than a 5-step manual stepper.

Separately, `orders.payment_method` changes from a 3-value check
constraint (`gcash`/`cash`/`bank_transfer`) to nullable free text, same
pattern as `products.category`/`ingredients.category`/`expenses.category`.
The UI still offers curated quick-pick chips (Cash, GCash, Bank Transfer,
PayPal, or type your own — `src/utils/validation/orderSchemas.ts`'s
`PAYMENT_METHOD_OPTIONS`), defaulting to Cash, so data stays reportable
without a DB-level cap.

**Why (status):** `confirmed` and `preparing` were dropped because they'd
duplicate what Phase 8's Production screen already tracks per item via
`order_items.production_status` — an order-level status doesn't need to
shadow that granularity. `ready` was renamed to `delivered` to match what
the baker action actually means. This also resolves a stale term in
`docs/UI_UX_1.md` section E.2 ("mark-delivered action"), which referred to
a status value ("delivered") that didn't actually exist in the original
6-value enum.

**Why (payment_method):** the original 3-value list was Philippines-
specific (GCash, Cash, Bank Transfer) and didn't fit a baker using PayPal,
Venmo, or any other regional payment app. Free text with curated chips —
the pattern already used for every other "categorize this, but let the
baker's own words win" field in the app — avoids a repeat schema change
every time a new payment method comes up, while still keeping Reports
(Phase 11) able to group profit by payment method later.

**Alternatives considered:** Keeping the original 6-status pipeline with a
baker-facing "next status" stepper — considered closer to the original
Phase 7 spec, but the baker's actual daily need is captured by two quick
actions (delivered, paid), and forcing a manual walk through
confirmed/preparing added steps without adding real information, since
Production owns per-item progress separately. A fixed, larger
`payment_method` enum (adding e.g. `paypal`, `venmo`) was also considered
over free text — rejected because it just delays the same problem to the
next unlisted payment app a baker outside the Philippines uses.

**Doc impact:** `docs/DATABASE.md`'s `orders` table and `docs/PRODUCT.md`'s
order business-rule bullet and workflow line updated to match. Existing
order rows (there shouldn't be any yet — Orders UI didn't exist before
this phase) are defensively remapped by the migration before the new,
stricter check constraint is applied:
`confirmed`/`preparing` → `pending`, `ready` → `delivered`.

**Known follow-up, not resolved by this change:** `src/services/orders.ts`'s
`updateOrder` currently replaces an order's line items wholesale on every
edit (delete all `order_items`, re-insert fresh rows) rather than diffing
by id. That's fine today — Production/inventory deduction (Phase 8)
doesn't exist yet, so no `order_items.id` is referenced anywhere else yet —
but it would orphan any future `inventory_movements.reference_id` once
Phase 8 lands. Worth a proper diff-based update before or during Phase 8,
flagged here so it isn't forgotten.

### 2026-08-22 — Jest actually installed; extracted `calculateRestockCostPerUnit` out of `ingredients.ts`

**Decision:** Installed `jest`, `jest-expo`, `@types/jest`, and
`@react-native/jest-preset` (all pinned to versions matching this
project's Expo SDK 57 / React Native 0.86.2), added a `test` script and a
`"jest": { "preset": "jest-expo" }` block to `package.json`, and added
`"types": ["jest"]` to `tsconfig.json`'s `compilerOptions` (needed because
the installed TypeScript, 6.0.3, doesn't auto-detect `@types/jest` the way
older TypeScript versions did). This finally lets `costing.test.ts`,
`stockGauge.test.ts`, and the new `orderLogic.test.ts` actually run,
closing a gap flagged as open in the 2026-08-16 "stock gauge" entry.

Running the suite for the first time surfaced a real, separate issue:
`ingredients.test.ts` failed with `[@RNC/AsyncStorage]: NativeModule:
AsyncStorage is null`. Its only import was
`calculateRestockCostPerUnit` — a pure function — but that function lived
inside `ingredients.ts`, which also imports `./supabase` at the top of the
file. Importing anything from `ingredients.ts` therefore pulls in the real
Supabase client and, through it, AsyncStorage, which needs a native-module
mock to run under Jest at all.

Moved `calculateRestockCostPerUnit` into a new file, `ingredientLogic.ts`
— zero Supabase import, same pattern already used by `costing.ts`,
`stockGauge.ts`, and the new `orderLogic.ts` (see this same date's earlier
entry). `ingredients.ts` now imports the function from there instead of
defining it. `RestockSheet.tsx`'s import updated to match.
`ingredients.test.ts` renamed to `ingredientLogic.test.ts` (content
unchanged) to match its subject file, same convention as
`orderLogic.test.ts`/`stockGauge.test.ts`.

**Why:** `CODING_STANDARDS.md` requires a Jest test for every function
that computes a number a baker will trust — that's meaningless if the
test can't run. The AsyncStorage failure wasn't a flaw in the function
being tested; it was a structural cost of testing pure logic that happened
to share a file with an unrelated Supabase import. Splitting pure logic
into its own file — a pattern this codebase already uses three other
times — fixes it directly rather than working around it with a global
Jest mock, which would hide the same problem the next time a pure
function gets added inside a Supabase-importing service file.

**Verified:** `npx tsc --noEmit` — zero errors, project-wide. `npx jest` —
4 suites, 50 tests, all passing.

### 2026-08-22 — Built the Orders list screen; no per-screen FAB, following Products' precedent

**Decision:** `app/(tabs)/orders.tsx` (a flat placeholder route) replaced
with a folder-based route (`app/(tabs)/orders/_layout.tsx`,
`app/(tabs)/orders/index.tsx`), matching the same Stack pattern already
used by `more/products/` and `more/ingredients/`. The list screen has a
search bar (filters by customer name, client-side), the four filter chips
from `docs/UI_UX_1.md` section E.2 (Today/Upcoming/Unpaid/All), and order
cards showing customer, an item summary ("2× Carrot Cake (Medium) +1
more" — same "+N more" pattern as Products' variant price chips), status
badge, payment badge, and total.

`docs/UI_UX_1.md` section E.2 still describes "FAB for new order," but no
per-screen FAB was built — the global floating + button's contextual Quick
Add (see the 2026-08-19 entry) already covers "add an order" from every
tab, and `more/products/index.tsx`'s actual shipped screen already
dropped its own FAB in favor of that (only an empty-state "Add product"
button remains there). Orders follows the same already-established
precedent: no dedicated FAB, just an empty-state "New order" button (only
shown on the true first-run empty state, i.e. the "All" filter with zero
orders) plus the global Quick Add. `docs/UI_UX_1.md`'s "FAB for new
order" line is now stale relative to the actual app, same category of
drift as Product Detail's already-flagged section 5b — noted here rather
than silently left inconsistent, full doc pass not done as part of this
entry.

**New helper file:** `src/utils/dateFormat.ts` (`formatOrderTime`,
`formatOrderDate`, `todayDateString`) — `src/services/orders.ts` now
imports `todayDateString` from here instead of keeping its own private
copy, so the list's server-side "what counts as today" filter and the
card's client-side "is this overdue" check can never quietly drift apart
from each other.

**Status colors updated to match the schema:** `src/theme/colors.ts` and
`src/theme/palettes.ts` (the per-accent-swatch light/dark palette
builder) both still had `statusConfirmed`/`statusPreparing`/`statusReady`
from the pre-2026-08-22 6-value status model. Updated to
`statusPending`/`statusDelivered`/`statusCompleted`/`statusCancelled`,
matching this same date's earlier status-simplification entry — this was
a mechanical follow-through on that decision, not a new one, since the
mapping (Delivered=success, Completed=textSecondary, Cancelled=danger)
was already implied by that entry's reasoning.

**Verified:** `npx tsc --noEmit` — zero errors, project-wide. `npx jest`
— 4 suites, 50 tests, all passing (list screen has no logic of its own to
unit-test; the numbers it displays — totals, status — all come from
already-tested `orderLogic.ts` functions and `formatCurrency`/
`formatOrderTime`/`formatOrderDate`, which are pure display formatting,
not business math, per `docs/CODING_STANDARDS.md`'s "computes a number a
baker will trust" test requirement).

### 2026-08-22 — Built the New Order screen (multi-item cart)

**Decision:** `app/(tabs)/orders/new.tsx` — full-screen form per
`docs/UI_UX_1.md`'s interaction-weight table. Customer name/contact,
Pickup/Delivery segmented toggle (delivery address + fee fields only
appear for Delivery), date + time pickers
(`@react-native-community/datetimepicker`, first real usage of that
dependency added earlier), a multi-item cart, and notes. New component
`src/components/OrderItemSheet.tsx` — a two-step picker (product, then
one of its variants, then quantity), same pattern as
`RecipeIngredientSheet.tsx`'s ingredient picker with an extra step for
variant. A product with only one variant auto-selects it rather than
making the baker pick from a list of one.

The cart only ever sends `{product_id, variant_id, quantity}` to
`orderFormSchema` — never a price. `selling_price` is shown in the picker
sheet and used for the form's own running subtotal/total display, but
`src/services/orders.ts`'s `createOrder` re-fetches each variant's
current price at save time regardless (see that file's existing
comments), so what's briefly shown while filling out the form is never
what actually gets persisted.

**Two bugs caught before shipping, not after:** the Delivery-only
`delivery_address`/`delivery_fee` fields are hidden (not unmounted-and-
cleared) when the baker switches back to Pickup, so their state doesn't
reset on its own. Without a fix, switching Delivery → Pickup right before
saving would have silently submitted a stale address/fee on a pickup
order. Fixed by forcing both to their empty/zero values at submit time
whenever `fulfillment_type` isn't `'delivery'`, rather than trusting
whatever's left in the hidden fields' state.

**Temporary substitution, flagged for Stage 4:** `docs/UI_UX_1.md`'s key
flow says New Order "saves → Order detail," but Order Detail
(`/orders/[id]`) doesn't exist until Stage 4. `onSuccess` currently
navigates back to the Orders list (`router.replace('/orders')`) instead —
noted in a code comment as needing to become
`router.replace(\`/orders/${order.id}\`)` once Detail ships, so this
isn't forgotten as a loose end.

**Wired up:** `src/components/FloatingTabBar.tsx`'s "Add order" Quick Add
entry now points to `/orders/new` in all three tabs that offer it (Home,
Orders, Production) — previously disabled/no-op placeholders since Orders
didn't exist yet.

**New helpers:** `src/utils/dateFormat.ts` gained `toISODateString` and
`toTimeString` — the inverse of the display formatters added in the
previous entry, converting a native picker's `Date` back to the
`"YYYY-MM-DD"`/`"HH:MM:SS"` strings the schema and database expect.

**Verified:** `npx tsc --noEmit` — zero errors, project-wide. `npx jest`
— 4 suites, 50 tests, all passing (no new business logic requiring its
own test — the form's running subtotal/total display uses the same
arithmetic as `calculateOrderTotals`, but isn't itself a separate
function to test; the authoritative totals calculation still only lives
in `orderLogic.ts`).