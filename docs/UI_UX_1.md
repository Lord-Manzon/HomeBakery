# HomeBakery — UX Architecture & Screen Specification

The working reference for building HomeBakery — navigation, flows, screen
states, and the design system. Keep this open alongside implementation.

---

## A. Information architecture

```
HomeBakery app
├── Home (dashboard)
│   ├── Today's summary (orders, revenue, unpaid, low stock, production)
│   ├── Needs attention list → deep-links into Orders / Ingredients
│   └── Quick actions → New order, Add expense
├── Orders
│   ├── Orders list (filter: Today / Upcoming / Unpaid / All)
│   │   └── Order detail
│   │       ├── Edit order (full screen)
│   │       ├── Payment status (inline toggle)
│   │       ├── Mark delivered (inline action)
│   │       └── Delete / cancel (inline confirm, replaces button)
│   └── New order (full screen form)
├── Production
│   ├── Day selector (Today / Tomorrow / pick a date)
│   ├── Bake list (grouped by product → variant → quantity)
│   └── Ingredient checklist → tap missing ingredient → Ingredients
└── More
    ├── Ingredients
    │   ├── Ingredient list (sortable by low stock)
    │   └── Ingredient detail (same as above — reached from More now)
    |         ├── Stock adjustment (bottom sheet)
    │         └── Restock / purchase (full screen form)
    ├── Products
    │   ├── Product list
    │   └── Product detail
    │       ├── Variants list
    │       │   └── Add / edit variant (bottom sheet)
    │       └── Recipe & costing (per variant; Phase 4 placeholder, Phase 6 real)
    ├── Expenses
    │   ├── Expense list (grouped by date)
    │   ├── Add expense (bottom sheet, 3 fields)
    │   └── Expense detail → Edit / Delete
    ├── Reports
    │   ├── Period selector (week / month / custom)
    │   ├── Revenue, expenses, profit summary
    │   ├── Top-selling products
    │   └── Calendar/profit view → drill into a single day
    ├── Storefront Settings
    ├── Subscription
    └── Account
```

---

## B. Navigation structure

**Bottom nav: Home · Orders · Production · More**

Four tabs, plus a global + button in a fixed position beside the tab bar
(same visual weight, so the bar still *reads* as five elements even though
only four are navigation destinations). — everything on the bar gets
touched *daily*; setup-heavy or weekly-review work lives under More, where
it doesn't compete for thumb space.

- **Home, Orders, Production, Ingredients** — used every day, often
  mid-task with hands busy. One tap away at all times. Ingredients earns its
  own tab because stock-checking is a frequent, often-standalone check for a
  solo baker ("do I have enough butter before I commit to this order?"), not
  only something triggered by a shortage warning elsewhere.
- **More** — houses Products (with Recipe & costing nested inside variant
  editing, never its own tab), Expenses, Reports, Storefront Settings,
  Subscription, Account. A baker configures a product once and rarely
  revisits; these don't deserve permanent nav real estate.
- **Expenses is the exception that still needs speed.** It's not a tab, but
  Home carries a permanent "+ Add expense" quick action that opens straight
  into a 3-field bottom sheet — reachable in one tap without being a
  browsable section.
- **Ingredients is also reached contextually, on top of its tab.**
  Production's missing-ingredient rows and Home's low-stock alerts both
  deep-link straight into the relevant ingredient's detail screen,
  pre-scrolled and ready to restock — the tab is for browsing/checking stock
  cold, the deep links are for acting on a specific shortage.

**Revisited 2026-08-19:** reverted to folding Ingredients into More,
now that the global Quick Add FAB (see section G) covers the fast-access
need a dedicated tab was originally protecting. See `docs/DECISIONS.md`.

**Interaction weight — when to use what:**

| Pattern | Use for | Example |
|---|---|---|
| Full screen | Many fields, or the user needs to focus | New order, Edit order, New product, Restock form |
| Bottom sheet | 2–4 fields, quick and dismissible | Add expense, Add/edit variant, Stock adjustment, Edit ingredient quantity |
| Inline toggle/action | Binary or few-state changes on a screen already open | Payment status, Mark delivered |
| Inline confirm (swap button) | Destructive but low-ceremony | Delete order/expense, Deactivate product/variant |
| Modal dialog | Reserved for irreversible, high-stakes actions only | (Rare in this app — most "deletes" use inline confirm instead) |

---

## C. Screen map

| Screen | Reached from |
|---|---|
| Home | App launch, bottom nav |
| Orders list | Bottom nav, Home "today's orders" |
| Order detail | Tap any order card |
| New order | FAB on Orders, Home quick action |
| Production | Bottom nav |
| Ingredient checklist (within Production) | Scroll within Production |
| Ingredients list | More menu, or Quick Add → Restock/Add ingredient |
| Ingredient detail | Tap ingredient in Ingredients, or tap a missing-ingredient row in Production/Home |
| Products list | More menu |
| Product detail | Tap a product |
| Add/edit variant (sheet) | Tap "Add variant" or an existing variant row, from Product detail |
| Recipe & costing | Tap "Recipe & costing" on Product detail (per variant) |
| Expenses list | More menu, Home quick action (opens Add expense directly) |
| Reports | More menu |

---

## D. Key user flows

**Create order**
Orders (FAB) → New order form (customer, product, variant, qty, date/time,
delivery or pickup, notes) → saves → Order detail → from here: Edit / toggle
Payment / Mark delivered / Delete.

**Create product** *(Phase 4 detail below in section E.5–E.6a)*
Products (FAB) → New product (name, optional category — icon-backed
quick-pick chips or "+ New" to create one, see docs/DECISIONS.md's
2026-08-18 entry — optional photo) → Product detail (empty variants) →
Add variant (sheet: name, selling price, packaging cost) → variant appears
in the list → Recipe & costing (Phase 4: placeholder; Phase 6: ingredients +
cost breakdown auto-calculate using the resolved margin — variant → product
→ recipe → baker default, per docs/DATABASE.md).

**Production**
Orders (aggregated automatically by product + variant + day) → Production
screen's Today/Tomorrow/Upcoming tabs group by product → variant →
combined quantity → each row's ingredients compared against current stock
→ a row missing enough for its own batch, or drawing on something already
low, is flagged and its "Restock →" link lands directly on that
ingredient's detail screen, pre-filled to restock → checking a row off
updates the checklist immediately; ingredient deduction itself only fires
once the whole day's list is fully checked off (see docs/DECISIONS.md's
2026-08-28 entries for why), and can be turned off entirely in Settings.

---

## E. Screen-by-screen UX

### 1. Home
**Visible:** greeting, 4 metric cards (orders today, revenue today, unpaid,
low stock — the last two tinted to read as attention-needed), a "needs
attention" list (low stock + unpaid orders, tappable), today's orders
(compact), today's production summary, two quick-action buttons.
**Why this order:** attention items first — that's the whole point of a
morning check-in. Revenue and counts are context, not the headline.
**Taps:** any row → its detail screen (order, ingredient). Quick actions →
New order (full screen) / Add expense (sheet).
**States:** *Empty* — first-run dashboard shows a friendly setup checklist
(add your first product, add an ingredient) instead of empty metric cards.
*Loading* — skeleton cards, no spinner. *No orders today* — the
today's-orders section collapses to a single "Nothing scheduled today" line
rather than an empty box.

### 2. Orders
**List:** filter chips (Today / Upcoming / Unpaid / All), search icon, FAB
for new order. Each card shows customer, product + variant, time,
delivery/pickup, and a payment-status chip.
**Detail:** customer, product, time, address/pickup note, total, payment
chip (tap to toggle), mark-delivered action, edit (full screen), delete
(inline confirm).
**Why payment and delivery are inline, not screens:** they're binary state
changes on data already in front of the user — sending them elsewhere would
cost taps for no benefit.
**States:** *Empty* — "No orders yet" with a New order CTA. *Loading* —
skeleton rows. *Error* — retry button, no jargon. *Overdue* — an order whose
date has passed and is still unpaid/undelivered gets a distinct chip color
so it doesn't blend into "today's" orders.

### 3. Production
**Visible:** a Today / Tomorrow / Upcoming segmented switcher, a progress
bar ("N of M completed"), a bake list grouped by product → variant →
combined quantity across every order sharing that date, and below it an
Ingredients section toggling between "Needed for production" (this
date's — or for Upcoming, the whole range's — combined requirement per
ingredient) and "Low stock" (every ingredient currently low or out,
baker-wide, same underlying data as the Ingredients tab's own low-stock
view).
**Why aggregation matters:** the whole value of this screen is turning "4
single rolls + 3 boxes of 2 + 2 boxes of 4" into "18 rolls" — a baker
shouldn't have to do that math by hand.
**Two ingredient vocabularies, on purpose:** "Needed for production" rows
read Enough / Low / Need restock — a production-batch-specific question
(do I have enough for what I'm baking right now), using circular
checkmark-circle/alert-circle indicators, never the rectangular pills
from early mockups. "Low stock" rows reuse the Ingredients tab's own
existing "Low stock"/"Out of stock" wording unchanged, since that toggle
is surfacing the same general fact that screen already shows.
**Taps:** a Restock link on any non-"Enough" ingredient row lands directly
on that ingredient's detail screen, pre-filled to restock. "View all"
opens the Ingredients tab.
**Checking off a row:** always updates the checklist immediately.
Whether it also deducts inventory depends on the `bakers.
auto_deduct_inventory` setting (Settings, on by default) — see
docs/DECISIONS.md's 2026-08-28 entries for the exact deduction-timing
rule (gated on the whole day's list reaching 100%, not fired per
checkbox) and how it stays idempotent across repeated check/uncheck.
**States:** *Nothing to bake* — "Nothing to bake today"/"Nothing
scheduled for tomorrow yet"/"Nothing scheduled beyond tomorrow yet",
depending on the active tab. *Upcoming* spans many future dates, so it's
laid out as one date-header section per day (each with its own small
"X/Y done" count) rather than a single combined progress bar, which
wouldn't be a meaningful number across unrelated days.

### 4. Ingredients
**List:** ingredient name, current quantity + unit, low-stock badge where
relevant, sortable so low-stock items surface to the top.
**Detail:** current stock, cost, usage history (light — just enough to spot
trends), two actions: Stock adjustment (sheet: quick +/- with a reason:
used, wasted, restocked) and Restock/purchase (full screen: quantity
purchased, cost, optional supplier — this one recalculates cost-per-unit
across the ingredient's recipes).
**Why two separate actions instead of one form:** adjusting stock (used
200g baking) and restocking (bought 5kg) are different mental actions with
different consequences — a restock changes cost math, a usage adjustment
doesn't. Conflating them into one generic "edit quantity" field would make
cost tracking unreliable. This also maps directly onto
`inventory_movements.movement_type` in docs/DATABASE.md
(`restock`/`usage`/`adjustment`/`waste`) — the UI distinction isn't
cosmetic, it's the same distinction the audit log needs.
**States:** *Low stock* — amber/red badge depending on how far below
threshold. *Empty* — "Add ingredients to track stock."

### 5. Products list (More)
**CHANGED 2026-08-17:** card layout and category filtering below replace
this section's original spec — see `docs/DECISIONS.md`'s 2026-08-17 entry
("Reopened: product categories are now MVP").

**CHANGED 2026-08-18:** primary "add" action moved from the top-right `+`
icon (below) to a floating action button (FAB, bottom-right) — see
`docs/DECISIONS.md`'s 2026-08-18 entry. Matches the pattern already
shipped on the Ingredients tab.

**MERGE NOTE (2026-08-18):** this section combines detail from two
branches that each described part of this screen — the category filter
row and full per-variant price-chip list came from one version, the FAB
and product-photo/placeholder-tile detail from the other. Worth a quick
read-through against the actual built screen to confirm this matches,
since it was reconciled by combining docs, not by re-checking the code.

**CHANGED 2026-08-18 (second entry):** card layout moved from a
single-column list-row card to a 2-column image-forward grid, capped at
2 variant price chips (+"N more") per card instead of one chip per
variant; a sort control was added; category chips gained icons and a
trailing "+ New" chip. See `docs/DECISIONS.md`'s 2026-08-18 "Products
list moves from a list-row layout to an image-forward grid" entry and
the Grid card entry in section F's Components list.

**Layout:** title, a sort icon (dropdown: Name A–Z / Name Z–A / Newest
first, dismissible by tapping outside — same pattern as Product Detail's
overflow menu), search icon, a category filter chip row (see below), a
floating action button (FAB, bottom-right) opens New product — the same
pattern already used on the Ingredients tab. A 2-column grid of product
cards (see the Grid card entry in section F): each card shows a large
top-anchored photo (or a neutral placeholder tile when none is set),
name (wraps up to 2 lines rather than truncating), and up to 2 variant
price chips with a "+N more" chip once a product has more than that —
capped down from the earlier "one price chip per active variant" design
since a narrower grid card has less room per card than the old
full-width row did. No chevron — the whole card is tappable.
**Category filter row:** chips generated dynamically from the distinct
`category` values currently in use across the baker's own products —
"All" always first and always present, then one chip per distinct
category in use, alphabetical, each showing its icon (looked up from
`product_categories` by name — see `docs/DECISIONS.md`'s 2026-08-18
"Product categories get their own table" entry). A product with no
category set shows under "All" only. No fixed/curated list, no empty
placeholder chips for unused categories — removing the last product in a
category quietly removes that chip too. The row ends with a trailing
"+ New" chip that opens the category creator screen (5d). Same
interaction pattern as the Ingredients list's category row (horizontal
scroll, not wrap).
**Taps:** FAB → New product (full screen, see 5a). Sort icon → the sort
dropdown. Search icon → inline search field, filters live by name.
Category chip → filters the grid to that category (single-select, same
as Ingredients); "+ New" chip → New category (5d). Product card →
Product detail (5b) — a real routed screen (`/more/products/[id]`), not
an inline expansion, so it gets its own back button, deep link, and
loading state per `docs/CODING_STANDARDS.md`.
**States:** *Loading* — skeleton grid tiles, no spinner. *Empty (no
products yet)* — friendly onboarding card (illustration/icon + one line
+ primary button "Add your first product") → New product screen;
category row hidden entirely (nothing to filter yet). *Error* — retry,
plain language, no jargon. *Search, no matches* — "No products match
'`query`'" with a clear-search action, distinct from the true empty
state.

### 5a. New product (full screen)
Reached from: Products list `+`, or the empty-state CTA.
**CHANGED 2026-08-17:** category is now MVP — see
`docs/DECISIONS.md`'s 2026-08-17 entry.
**Fields:** Name (required, text) · Category (optional — icon-backed
quick-pick chips sourced from `product_categories`, ending in a "+ New"
chip that opens the category creator (5d) instead of typing free text
inline — see `docs/DECISIONS.md`'s 2026-08-18 entry; `products.category`
itself is still plain text under the hood, same as Ingredients/Expenses,
just always populated by picking a chip now rather than typing) · Photo
(optional, image picker → Supabase Storage).
**Editing categories:** long-press any category chip to enter an
editable state — every chip wiggles and grows a small "×" badge
(iOS-homescreen-style), "Done" exits. Tapping × opens a confirm dialog
before removing that category (per `docs/CODING_STANDARDS.md`'s
confirmation-before-delete rule), not an instant delete.
**Validation (Zod):** `name` required, 1–100 chars, trimmed. `category`
optional, 1–50 chars if provided, trimmed. `image_url` optional.
**States:** *Default* — Save disabled until name is non-empty. *Saving* —
spinner, fields disabled. *Error* — inline banner, fields stay filled,
retry by re-tapping Save. *Photo upload failure* — handled separately from
product-save failure: offer "Save without photo" rather than blocking the
whole save on a flaky upload. *Success* — navigate to the new product's
detail screen (empty variants, see 5b).

### 5b. Product detail
> **FLAGGED (2026-08-18):** this section still describes the original
> list-row variant layout (name/price rows + a persistent two-button
> footer). The actual screen was redesigned directly in code to a
> full-width tappable hero photo, a 2-up variant card grid with
> long-press-to-reveal delete, and a single "Recipe & costing" button —
> not yet written up here. The two lines below (editable name, category
> icon) are accurate as of 2026-08-18; the rest of this section needs a
> proper pass against the actual screen, not a quick patch alongside
> unrelated edits.

**Layout:** product name as title — tappable to edit inline (pencil icon
signals this; commits on blur or the keyboard's Done, reusing the same
save call the photo-upload feature already used — see
`docs/DECISIONS.md`'s 2026-08-18 "Product name is editable inline"
entry), list of variant rows (name, price), "Add variant" (secondary)
and "Recipe & costing" (primary) buttons.
**Category:** shown as a pill with its icon, looked up from
`product_categories` by name and falling back to a default icon if no
matching row exists (e.g. the category was later deleted) — see
`docs/DECISIONS.md`'s 2026-08-18 entries.
**Empty variants (new product):** replace the variant list with "This
product has no sizes yet" + a single prominent "Add variant" button. Hide
"Recipe & costing" entirely until at least one variant exists — a disabled
button here is more confusing than no button, since costing has nothing to
attach to yet.
**Variant row tap:** opens that variant in the edit sheet (5c), pre-filled.
**"Recipe & costing" tap:** navigates to that screen (6) for the product's
**default variant** (`is_default = true`). Disabled with "Add a variant
first" subtext if none exists.
**Deactivate product:** reached via an overflow (`⋮`) menu, top-right —
inline confirm pattern (button swaps to Cancel/Confirm in place). Sets
`is_active = false` — soft delete only; the product drops off the
storefront (Phase 12) but existing order history is untouched.
**States:** *Loading* — skeleton variant list. *Error* — retry, same
pattern as the list screen.

### 5c. Add / edit variant (bottom sheet)
**Fields:** Name (required — e.g. `"Medium — Serves 8"`; the
serving/yield note folds into the name itself rather than a separate DB
field, since `product_variants` has no column for it — see
`docs/DECISIONS.md`) · Selling price (required, numeric, the baker's own
chosen price) · Packaging cost (optional, numeric, defaults to 0).
**Not in this sheet:** recipe linkage, `recipe_portion`, and
`suggested_price` — all set later, inside Recipe & costing once Phase 6
exists. `suggested_price` specifically is never a field anyone types into;
it's a calculated value (`cost ÷ (1 − margin%)`) the app produces once a
recipe is linked, shown alongside the selling price the baker already set
so they can compare "what I'm charging" vs. "what the math suggests," per
`docs/PRODUCT.md`.
**Validation (Zod):** `name` required, 1–100 chars. `selling_price`
required, positive number, ≤2 decimals. `packaging_cost` optional,
non-negative, defaults to 0.
**Default variant logic:** the first variant added to a product
automatically becomes `is_default = true` (nothing else to default to).
Later variants default to `false`; a "make this the default" toggle only
appears once 2+ variants exist.
**States:** *Default* — empty (Add) or pre-filled (Edit), Save pinned at
bottom, dismissible by swipe/tap-outside. *Validation* — inline error text
under the specific field, plain language (e.g. "Enter a price above ₱0"),
never a toast. *Saving* — spinner, sheet can't be dismissed mid-save.
*Error* — inline banner inside the sheet, fields stay filled.
**Deactivating a variant:** same inline-confirm pattern, reached from the
variant's own row — sets `is_active = false`, doesn't hard-delete.

### 5d. New category (full screen)
Reached from: the "+ New" chip on New Product's category row, or the
Products list's category filter row.
**Fields:** Name (required) · a 10-icon curated grid (required — Create
disabled until both are set). No color picker — color is derived
automatically from the name, see `docs/DECISIONS.md`'s 2026-08-18 entry.
**On save:** inserts a `product_categories` row, then returns to
wherever it was opened from; the new category appears as a selectable
chip immediately (shared query cache), no further action needed to see
it show up.
**Deleting a category:** not from this screen — see the "Editing
categories" note under 5a.

### 6. Recipe & costing
Reached only from a variant's context — **never** a bottom-nav or
More-menu destination (see section B).

**Phase 4 scope (current):** the screen exists as a real, routed
placeholder so the "Recipe & costing" button has somewhere to go, but shows
no computed numbers yet. Title + variant name (e.g. "Carrot cake —
Medium"), and a single card: *"Recipe & costing isn't set up yet — this
comes in a later phase. For now, you can still manage your product and
variant details."* No ingredient list, no cost breakdown — that's Phase 6.

**Phase 6 scope (future, not built yet):** ingredient list with quantities
and a collapsed cost summary card (cost per unit, profit margin) at the
top — expand for the full breakdown (ingredient cost, packaging cost,
total cost, selling price, profit). Collapsed by default so a baker can
glance at "am I still profitable" without re-deriving the math each time.
Tapping an ingredient row opens an edit sheet (quantity + unit); saving
live-updates the cost breakdown above. *No recipe yet* prompts "Add
ingredients to see your cost per unit." *Negative margin* switches the
profit figure to the danger color, no separate warning banner needed.

### 7. Expenses (More)
**List:** grouped by date, each row shows category icon, amount, short
note.
**Add expense:** bottom sheet — amount, category (chips: Ingredients,
Packaging, Gas, Delivery, Utilities, Other), optional note. Three taps,
done — this has to be fast enough to log while still standing at the
counter.
**Detail/edit:** tap a row to edit or delete (inline confirm, same pattern
as orders).
**States:** *Empty* — "Log your first expense" CTA. *Loading* — skeleton
rows.

### 8. Reports (More)
**Visible:** period selector, three summary cards (revenue, expenses,
profit), a top-products list, and a calendar view where each day is shaded
by profit — tap a day to drill into that day's orders and expenses.
**Why a calendar instead of a line chart:** a solo baker thinks in "was last
Tuesday's market worth it," not in trend lines. A shaded calendar answers
that at a glance and doubles as a way to jump into any past day's detail.
**Taps:** any summary card or calendar day drills into the underlying
orders/expenses for that period.
**States:** *No data for period* — "Nothing recorded yet for this period"
rather than a broken-looking empty chart.

---

## F. Design system

The tokens to actually implement in `src/theme/`.

> **Status:** these are the target tokens. The Phase 1 `src/theme/` files
> currently ship placeholder values written before this design system
> existed — updating them to match is a small, tracked follow-up (see
> docs/DECISIONS.md), not yet done as of this doc's merge.

### Color

| Role | Hex | Use |
|---|---|---|
| Primary / accent | `#C9683F` | Primary buttons, active nav icon, FAB, links |
| Primary hover/pressed | `#B85A34` | Button pressed state |
| Success (paid, delivered, in stock) | `#5C8A54` | Status chips, checkmarks |
| Warning (pending, unpaid) | `#D99A33` | Status chips |
| Danger (low stock, overdue, delete) | `#C6533F` | Status chips, destructive actions |
| Background | `#FBF7F1` | App background (warm off-white, not pure white) |
| Surface / card | `#FFFFFF` | Cards, sheets |
| Border | `#E8E0D5` | Hairlines, card borders |
| Text primary | `#2E2A26` | Body text (warm charcoal, not pure black) |
| Text secondary | `#8A8378` | Supporting text, timestamps |

Tint each status color at ~12% opacity for chip/card backgrounds (e.g.
danger chip = `#C6533F` text on a `#F7E7E3`-ish tint).

### Typography

One family keeps the app light to build and ship — fewer font assets to
bundle, one less thing to get inconsistent across screens.

- **Font:** Nunito (rounded terminals read as warm/friendly without being
  childish; free on Google Fonts, works well on Android). Adding this is a
  new dependency (`@expo-google-fonts/nunito` + `expo-font`) — to be added
  deliberately with a docs/DECISIONS.md entry when the theme files are
  updated, not silently.
- **Scale:** Screen title 20/600 · Section header 15/600 · Body 14/400 ·
  Secondary/caption 12/400 · Metric numbers 22/600.
- Only two weights in practice: 400 for body, 600 for anything that needs
  to stand out. Avoid a third weight — it adds visual noise, not hierarchy.

### Spacing & radius

- **Grid:** 4px base, used in multiples of 8 (8, 12, 16, 24, 32) for margins
  and gaps.
- **Corner radius:** cards and sheets 16px, buttons and chips-as-buttons
  10–12px, status chips fully rounded (pill).
- **Touch targets:** minimum 44×44px for anything tappable — this app gets
  used one-handed while a baker's other hand is full.

### Components

- **Primary button:** filled accent, white text, one per screen max — never
  two competing filled buttons side by side.
- **Secondary button:** outline, same corner radius, used for anything not
  the single primary action.
- **Status chip:** pill, tinted background + matching dark text
  (Paid/Delivered = success, Unpaid/Pending = warning, Overdue/Low stock =
  danger).
- **Metric card:** label (12px, secondary) above a large number (22px,
  semibold), no border — just a filled surface tile.
- **List row card:** bordered card, 10–12px radius, used for
  orders/expenses/ingredients — bordered rather than shadowed, so
  a long list doesn't look heavy. Products is the one exception — see
  "Grid card" below and `docs/DECISIONS.md`'s 2026-08-18 entry.
- **Grid card (Products only):** 2-column grid, large top-anchored photo
  (or a neutral placeholder), name, up to 2 variant price chips + a
  "+N more" chip once a product has more than that. Used specifically
  because product photos carry real recognition value the other lists'
  rows don't need.
- **Bottom sheet:** for 2–4 field quick entry (expense, variant, stock
  adjustment) — always dismissible by swipe or tap-outside, primary action
  pinned at the bottom.
- **Inline confirm:** the pattern used for delete/deactivate — swap the
  trigger button for Cancel/Confirm in place, no overlay.
- **Empty state:** short headline naming the space, one line of context, one
  clear CTA — never just "Nothing here."

### Iconography

Simple outline icons, single consistent stroke weight, accent-tinted when
active/selected and muted gray otherwise. Avoid filled icon variants — they
read heavier and inconsistent against the rest of the flat, warm aesthetic.
(Phase 1 currently uses Ionicons' outline set from `@expo/vector-icons`,
which already fits this — no change needed there.)

---

## Open notes from this merge

- **Product categories — resolved 2026-08-17:** was an open contradiction
  between this doc and docs/PRODUCT.md's "Later, not MVP" call. Reopened
  and settled — category is now MVP, optional free text, no fixed list.
  See docs/DECISIONS.md's 2026-08-17 entry and section E.5/5a above.
- **Theme token migration:** `src/theme/` needs updating from Phase 1's
  placeholder values to the tokens in section F, including adding Nunito as
  a font dependency. Tracked as a follow-up, not yet done.
- **Variant serving/yield note (added 2026-08-15):** folded into the
  variant `name` field rather than a new DB column — see section E.5c and
  `docs/DECISIONS.md`. Revisit only if this reads awkwardly in practice.


> **FLAGGED, not resolved (2026-08-18 merge):** a draft "find/replace"
> instructions file I (Claude) wrote for applying the gauge feature's
> UI_UX edits was appended here verbatim on the `main`-branch side of this
> file, rather than the edits actually being applied to section E.4
> (Ingredients) and the Components section. Section E.4 above still has
> the pre-gauge description (no stock gauge, no category filter, no
> sensitivity picker mentioned). Needs a proper pass to actually apply
> those edits to E.4 and the Components section — not done as part of
> this merge, since rewriting spec prose isn't a safe thing to auto-merge
> from two branches' worth of draft text.

---

## G. Global + button (Quick Add)

The bottom nav (4 tabs) and the + button are two separate floating
elements, not a single fixed bar — the tab pill and the FAB sit above
content with visible gaps around them, same position/size on every main
tab (Home, Orders, Production, More). Both hide together: scrolling down
inside any list slides them down and fades them out; scrolling back up
brings them back. If the nav hides while the Quick Add card is open, the
card closes with it — there's never a floating card left with no visible
FAB to dismiss it.

Tapping + opens a small popup card anchored bottom-right, directly above
the FAB (not a full-width bottom sheet) — a vertical list of 1–4 actions
relevant to the current tab, icon + label per row, top item visually
weighted since it's the tab's single most likely action.

| Tab | Quick Add contents | Notes |
|---|---|---|
| Home | Add order, Add ingredient, Add product, Add expense | Broadest menu — Home has no single obvious action |
| Orders | Add order | Still shown as a Quick Add card, for visual consistency — not a bare single-action FAB |
| Production | Add order, Restock ingredient, Add expense | No "create production" — production has no creatable entity (view over `order_items`, see DECISIONS.md 2026-08-12) |
| More | Add product, Add ingredient, Add recipe, Add expense | Doubles as fast access to Ingredients/Recipes, which no longer have their own tab |

**Why floating + scroll-to-hide instead of a fixed bar:** maximizes
visible content on data-dense screens (Ingredients, Orders, Reports,
Products) without giving up one-handed reachability — the nav reappears
the moment the baker scrolls back up or stops scrolling near the top.

**Why a popup card instead of a full-width sheet or radial fan:** see
`docs/DECISIONS.md`'s 2026-08-19 entry for the full comparison — a popup
card keeps the same icon+label vertical-list pattern used everywhere else
(bottom sheets), stays within the 44×44px touch-target minimum (section F)
without crowding, and needs far less custom motion code than a radial fan.

**Why contextual instead of identical everywhere:** a fixed four-option
menu on every screen would feel like a generic launcher rather than part
of that screen. Ordering within each menu puts the tab's single most
likely action first/most visually prominent (e.g. "Add order" leads on
both Orders and Production).