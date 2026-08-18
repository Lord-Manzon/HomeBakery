# HomeBakery — Database Design (Supabase / Postgres)

This is the initial schema design — enough detail to start building on, not
final migration SQL. Every table listed here belongs to exactly one baker
(via `baker_id`) unless noted otherwise, and every such table has RLS
restricting access to `baker_id = auth.uid()`.

## Entity overview

```
bakers (1) ──< products (1) ──< product_variants >── recipes (1) ──< recipe_ingredients >── ingredients
                                        │                                                          │
                                        │                                                          │
                                        ▼                                                          ▼
                                   order_items                                        inventory_movements
                                        │
                                        ▼
                                     orders

bakers (1) ── storefront_settings (1)
bakers (1) ──< expenses
bakers (1) ── subscriptions (1)
```

## Tables

### `bakers`
One row per business owner, 1:1 with `auth.users`.

| Field | Notes |
|---|---|
| `id` | uuid, PK, same as `auth.users.id` |
| `business_name` | |
| `currency` | e.g. `PHP` |
| `timezone` | for correctly bucketing "today's orders" |
| `default_margin_percent` | fallback margin used for suggested pricing when nothing more specific is set |
| `created_at` / `updated_at` | |

### `products`
What a customer sees and buys.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `name` | |
| `category` | nullable text, free text (baker-entered, no fixed list) — see docs/PRODUCT.md and docs/DECISIONS.md's 2026-08-17 entry. Same free-text pattern as `ingredients.category`/`expenses.category` |
| `description` | nullable |
| `image_url` | nullable, Supabase Storage |
| `margin_percent` | nullable — overrides the baker default for every variant of this product, unless a variant overrides it further |
| `is_active` | whether it shows on the storefront |
| `created_at` / `updated_at` | |

### `recipes`
Independent of any one product — a recipe can be reused by multiple variants.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `name` | |
| `yield_quantity` / `yield_unit` | e.g. `1` / `"8-inch cake"`, or `24` / `"cupcakes"` |
| `instructions` | text, nullable |
| `margin_percent` | nullable — a recipe-inherent margin baseline (e.g. an ingredient-heavy recipe that needs a higher floor), used when neither the variant nor the product specifies one |
| `created_at` / `updated_at` | |

### `recipe_ingredients`
Join table: what a recipe needs.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `recipe_id` | FK → recipes |
| `ingredient_id` | FK → ingredients |
| `quantity` | |
| `unit` | should match/convert to the ingredient's unit |

### `product_variants`
A specific size/option of a product — **this is where price, recipe
consumption, and packaging live**, not on the product itself, since two
variants of the same product can differ in all three.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `product_id` | FK → products |
| `recipe_id` | FK → recipes, nullable (a variant may not have a recipe yet) |
| `name` | e.g. `"Small"`, `"6-inch"` |
| `recipe_portion` | fraction of one recipe batch this variant uses (e.g. `0.25`) |
| `packaging_cost` | |
| `margin_percent` | nullable — overrides product/recipe/baker-default margin for this variant specifically (most specific, wins first) |
| `selling_price` | the baker's actual price (may equal or differ from the suggested price) |
| `suggested_price` | last computed suggestion, stored for reference/history |
| `is_default` | which variant shows first |
| `display_order` | |
| `is_active` | |

**Margin resolution order** (first one set wins): `product_variants.margin_percent`
→ `products.margin_percent` → `recipes.margin_percent` → `bakers.default_margin_percent`.
This keeps the baker's default fast to set up while letting a specific
variant, product, or recipe override it when its economics genuinely differ.
The resolved margin (whichever level supplied it) is what `suggested_price`
is calculated from.

### `ingredients`
Independent master records.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `name` | |
| `unit` | e.g. `g`, `ml`, `pcs` |
| `current_stock` | kept in sync via `inventory_movements`, never edited directly |
| `cost_per_unit` | |
| `low_stock_threshold` | nullable |
| `created_at` / `updated_at` | |

### `inventory_movements`
Every stock change is a row here — `ingredients.current_stock` is a
derived/cached value kept in sync by these. This is the audit history
answering "what happened to my stock?"

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `ingredient_id` | FK → ingredients |
| `movement_type` | `restock` / `usage` / `adjustment` / `waste` |
| `quantity_change` | signed (+ restock, − usage/waste) |
| `resulting_stock` | snapshot after this movement, for easy history display |
| `reference_type` | nullable — `order_item` / `manual` |
| `reference_id` | nullable — links back to the order item that caused it, if any |
| `note` | nullable |
| `created_at` | |

### `orders`

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `customer_name` | |
| `customer_contact` | phone/Messenger/etc. |
| `order_source` | `manual` / `storefront` |
| `status` | `pending` / `confirmed` / `preparing` / `ready` / `completed` / `cancelled` |
| `payment_status` | `unpaid` / `paid` |
| `payment_method` | nullable — `gcash` / `cash` / `bank_transfer` |
| `fulfillment_type` | `pickup` / `delivery` |
| `delivery_address` | nullable |
| `delivery_fee` | nullable, default 0 |
| `scheduled_date` / `scheduled_time` | when the order is needed |
| `notes` | nullable |
| `subtotal` / `total` | computed from order items + delivery fee at save time |
| `created_at` / `updated_at` | |

### `order_items`

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `order_id` | FK → orders |
| `product_id` | FK → products |
| `variant_id` | FK → product_variants |
| `quantity` | |
| `unit_price` | copied from variant at order time (price history stays correct even if the variant price later changes) |
| `line_total` | |
| `production_status` | `pending` / `done` — drives the Production screen and triggers inventory deduction when marked done |
| `notes` | nullable |

*Production* is intentionally **not** a separate persisted table for MVP —
it's a view over `order_items` (grouped by `scheduled_date`), with completion
tracked directly on the item. This avoids keeping two things in sync. If a
future need arises for production runs that don't map 1:1 to order items
(e.g. baking ahead of stock), a `production_batches` table can be added then.

### `expenses`

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers |
| `category` | e.g. `ingredients`, `packaging`, `utilities`, `delivery`, `other` |
| `amount` | |
| `description` | nullable |
| `expense_date` | |
| `created_at` | |

### `storefront_settings`
1:1 with `bakers`.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers, unique |
| `slug` | unique, used in the storefront URL |
| `is_public` | whether the storefront is currently open |
| `banner_image_url` | nullable |
| `description` | nullable |
| `contact_info` | nullable |
| `created_at` / `updated_at` | |

### `subscriptions`
Placeholder for later billing integration — not wired to a payment provider
yet.

| Field | Notes |
|---|---|
| `id` | uuid, PK |
| `baker_id` | FK → bakers, unique |
| `plan` | `free` / `premium` |
| `status` | `active` / `inactive` |
| `current_period_end` | nullable |

## Row Level Security approach

- Every baker-owned table: policies for `select` / `insert` / `update` /
  `delete` all check `baker_id = auth.uid()`.
- `product_variants`, `recipe_ingredients`, `order_items`: no `baker_id`
  column directly — their RLS policy joins up to the parent (`products`,
  `recipes`, `orders`) to check ownership, so ownership is never duplicated
  or able to drift.
- **Storefront access (anonymous):** rather than granting the `anon` role
  direct table access, expose two narrow Postgres functions:
  - `get_storefront(slug)` — returns only active products/variants for a
    baker whose `storefront_settings.is_public = true`.
  - `submit_storefront_order(slug, order_payload)` — validates the payload
    server-side and inserts an order with `status = 'pending'` and
    `order_source = 'storefront'`. The `anon` role gets `execute` on these
    functions only, never raw table access.
- No table ever grants `anon` direct `insert`/`update`/`delete`.

## Open questions for later phases

- Unit conversion between recipe-ingredient units and ingredient stock units
  (e.g. recipe calls for grams, ingredient purchased in kg) — MVP will
  require matching units; a conversion layer can be added later.
- Whether `order_items.production_status` needs a third state (`in_progress`)
  once real usage shows whether `pending`/`done` is enough.