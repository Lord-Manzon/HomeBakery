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
├── Ingredients
│   ├── Ingredient list (sortable by low stock)
│   └── Ingredient detail
│       ├── Stock adjustment (bottom sheet)
│       └── Restock / purchase (full screen form)
└── More
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

**Bottom nav: Home · Orders · Production · Ingredients · More**

Five tabs, kept deliberately at that count — everything on the bar gets
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

**Reaffirmed 2026-08-15:** a second mockup again proposed folding
Ingredients into More and giving Recipes its own top-level tab. Same
reasoning as above still holds — declined again. See `docs/DECISIONS.md`.

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
| Ingredients list | Bottom nav |
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
Products (`+`) → New product (name, photo — optional; category is a later
feature, not MVP, see docs/PRODUCT.md) → Product detail (empty variants) →
Add variant (sheet: name, selling price, packaging cost) → variant appears
in the list → Recipe & costing (Phase 4: placeholder; Phase 6: ingredients +
cost breakdown auto-calculate using the resolved margin — variant → product
→ recipe → baker default, per docs/DATABASE.md).

**Production**
Orders (aggregated automatically by day) → Production screen groups by
product → variant → quantity → ingredient checklist compares required vs.
in-stock → missing ingredient flagged red → tap → Ingredient detail,
pre-filled to restock → cost per unit updates → returns to an unblocked bake
list.

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
**Visible:** day selector (Today/Tomorrow/date), a bake list grouped by
product → variant → aggregated quantity, and an ingredient checklist
comparing required vs. available.
**Why aggregation matters:** the whole value of this screen is turning "4
single rolls + 3 boxes of 2 + 2 boxes of 4" into "18 rolls, here's what that
costs in flour" — a baker shouldn't have to do that math by hand.
**Taps:** a missing ingredient row is red and tappable, landing directly on
that ingredient's restock screen. Checking off a bake-list item marks it
done for the day (visual only — doesn't touch inventory until the baker
actually restocks or logs usage; the actual inventory deduction happens per
docs/DATABASE.md's `order_items.production_status` flow, not here).
**States:** *Nothing to bake* — "No orders need production today." *All
ingredients available* — checklist can collapse to a single "You have
everything you need" line instead of listing every ingredient as green, to
avoid clutter on a good day.

### 4. Ingredients

Visual reference: `Inventory-Variant-C-MoreComplete.html` mockup (card
layout, detail screen, sheet patterns) — nav corrected to the locked
5-tab structure, since the mockup itself showed Ingredients folded into
More (declined, see docs/DECISIONS.md).

**Movement-type mapping (locked):** the baker never sees the raw
`restock`/`usage`/`adjustment`/`waste` enum. Three baker-facing actions
map to the four DB movement types:
- **Restock** button → `movement_type = 'restock'`
- **Use / waste** sheet → `movement_type = 'usage'` (reason: "Used in
  production") or `movement_type = 'waste'` (reason: "Wasted" or
  "Spoiled" — both map to `waste`; the specific wording is stored in
  `inventory_movements.note`, no separate reason column needed). "Other"
  was considered and dropped — too ambiguous to map cleanly.
- **Edit → Quantity** (manual correction, e.g. after a physical count) →
  `movement_type = 'adjustment'`. No separate "Adjust stock" button
  exists — editing the quantity directly on the ingredient IS the
  adjustment action.

**4.1 — Ingredients list:** ingredient cards (name, category chip,
current stock + unit, low-stock badge where relevant), sortable so
low-stock items surface first. `+` action to add an ingredient.
**States:** *Loading* — skeleton cards. *Empty* — "No ingredients yet.
Add one to start tracking your stock." + primary "Add ingredient" button.
*Error* — retry, plain language. *Low stock* — amber/red badge depending
on how far below `low_stock_threshold`.

**4.2 — Ingredient detail:** back arrow + delete (trash) icon in header,
name, category chip, a 2×2 stat grid (Current stock / Status / Cost per
unit / Low-stock alert), three actions (**Restock**, **Use / waste**,
**Edit**), and a Stock history list below showing the reason label (not
the raw movement_type) with signed quantity, e.g. "Used in production ·
Aug 12 · −0.6 kg" or "Restocked · Aug 6 · +5 kg".
**Delete:** inline confirm pattern (not a modal, per section B). Blocked
with a plain-language message if the ingredient is referenced by any
`recipe_ingredients` row (DB enforces this via `on delete restrict`):
*"This ingredient is used in a recipe and can't be deleted. Remove it
from the recipe first."*
**States:** Loading (skeleton stat grid + history). Error (retry).

**4.3 — Restock (full screen):** Quantity to add (required, numeric) ·
Total cost paid (optional, numeric — the baker enters what they paid
overall, not a per-unit price; the service layer does that math).
**Validation (Zod):** `quantity` required positive number; `totalCost`
optional non-negative number.
**On save:** inserts an `inventory_movements` row (`restock`,
`quantity_change = +quantity`), updates `current_stock`, and — only if
`totalCost` was provided — recalculates `cost_per_unit` using a
**weighted average**:
```
new_cost_per_unit =
  (current_stock × current_cost_per_unit + total_cost_paid)
  ÷ (current_stock + quantity_added)
```
This blends existing stock's cost with the new purchase rather than
discarding what was already on hand — standard inventory costing, and
feeds directly into Phase 6's accuracy. This formula lives in
`src/services/` and needs a Jest unit test per docs/CODING_STANDARDS.md.
**States:** Default → Saving → Error (inline banner) → Success.

**4.4 — Use / waste (bottom sheet):** Quantity to remove (required,
numeric) · Reason — exactly three options: **Used in production**,
**Wasted**, **Spoiled**.
**Validation (Zod):** `quantity` required, positive, cannot exceed
`current_stock` ("Not enough stock — you have `X` `unit` left"); `reason`
required, one of the three values.
**On save:** inserts an `inventory_movements` row (`usage` if "Used in
production," else `waste`) with `note` set to the exact reason label,
`quantity_change = -quantity`. Does **not** touch `cost_per_unit` —
using/wasting stock doesn't change what what's left is worth per unit.
**States:** Default → Validation (inline, plain language) → Saving
(sheet can't dismiss mid-save) → Error → Success.

**4.5 — Add / Edit ingredient (bottom sheet):** Name (required) ·
Category (optional dropdown: Dry goods / Dairy / Flavoring / Packaging /
Other — see `ingredients.category`, added in migration `0004`) · Quantity
(required — starting stock on Add; on Edit, a *change* to this value
becomes the `adjustment` movement described above) · Unit (required
dropdown: kg/g/pcs/L/ml/bottle/box) · Low-stock threshold (optional).
**Validation (Zod):** `name` required 1–100 chars; `category` optional;
`quantity` required non-negative number; `unit` required enum; threshold
optional non-negative number.
**Add vs. Edit distinction for the DB:** on Add, initial quantity does
NOT create a movement row (no "before" state to log against — it's just
the starting value). On Edit, a changed quantity DOES produce an
`adjustment` movement (`quantity_change` = new − old), keeping the audit
trail accurate. Belongs in `src/services/ingredients.ts`, not just the
form.
**States:** Default (empty/pre-filled) → Validation → Saving → Error →
Success.

**No supplier field:** considered (an earlier draft of this section
mentioned one) but dropped — no supplier column exists in
docs/DATABASE.md, and the reference mockup's actual restock sheet doesn't
have one either. Revisit only if this becomes its own separately-decided
feature later.

### 5. Products list (More)
**Layout:** title, search icon, helper line ("Tap a product to see its
variants"), list of product cards. Each card: photo (or a neutral
placeholder tile when none is set), name, up to 3 variant chips (name +
price) with a "+N more" chip once a product has more than that, chevron.
A floating action button (FAB, bottom-right) opens New product — the same
pattern already used on the Ingredients tab, adopted here in place of the
original top-right `+` icon for consistency across the app's two
list-with-quick-add screens (see `docs/DECISIONS.md`, 2026-08-18).
**Taps:** FAB → New product (full screen, see 5a). Search icon → inline
search field replaces the helper line, filters live by name. Product card →
Product detail (5b) — a real routed screen (`/more/products/[id]`), not an
inline expansion, so it gets its own back button, deep link, and loading
state per `docs/CODING_STANDARDS.md`.
**States:** *Loading* — skeleton cards, no spinner. *Empty (no products
yet)* — friendly onboarding card (illustration/icon + one line + primary
button "Add your first product") → New product screen. *Error* — retry,
plain language, no jargon. *Search, no matches* — "No products match
'`query`'" with a clear-search action, distinct from the true empty state.

### 5a. New product (full screen)
Reached from: Products list `+`, or the empty-state CTA.
**Fields:** Name (required, text) · Photo (optional, image picker →
Supabase Storage). No category field — deferred to Later per
`docs/PRODUCT.md`.
**Validation (Zod):** `name` required, 1–100 chars, trimmed. `image_url`
optional.
**States:** *Default* — Save disabled until name is non-empty. *Saving* —
spinner, fields disabled. *Error* — inline banner, fields stay filled,
retry by re-tapping Save. *Photo upload failure* — handled separately from
product-save failure: offer "Save without photo" rather than blocking the
whole save on a flaky upload. *Success* — navigate to the new product's
detail screen (empty variants, see 5b).

### 5b. Product detail
**Layout:** product name as title, list of variant rows (name, price),
"Add variant" (secondary) and "Recipe & costing" (primary) buttons.
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
  orders/expenses/ingredients/products — bordered rather than shadowed, so
  a long list doesn't look heavy.
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

- **Product categories:** the "create product" flow mentions category as an
  option, but docs/PRODUCT.md explicitly defers categories to *Later*, not
  MVP, and docs/DATABASE.md's `products` table has no category column. MVP
  "New product" is name + optional photo only.
- **Theme token migration:** `src/theme/` needs updating from Phase 1's
  placeholder values to the tokens in section F, including adding Nunito as
  a font dependency. Tracked as a follow-up, not yet done.
- **Variant serving/yield note (added 2026-08-15):** folded into the
  variant `name` field rather than a new DB column — see section E.5c and
  `docs/DECISIONS.md`. Revisit only if this reads awkwardly in practice.

  