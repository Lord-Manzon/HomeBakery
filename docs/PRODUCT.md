# HomeBakery — Product Requirements

## Product goal

Give a home baker one simple app to run their baking business — replacing the
mix of Facebook posts, Messenger threads, notes, spreadsheets, and manual math
they currently use to track orders, ingredients, expenses, and profit.

The app should make the business easier to run, not turn baking into
bookkeeping. Every feature is judged against: *does this reduce mental load
for a solo baker on a busy day?*

## Target user

A home-based baker, usually solo, who:

- Takes orders through Facebook/Messenger and their memory or notes app
- Prices products by feel more than by real cost calculation
- Is not a professional programmer or accountant
- Uses their phone, not a desktop, for almost everything
- May be mixing batter with one hand and checking their phone with the other

## Core problems this solves

1. **"What do I actually make on this?"** — no clear view of ingredient cost,
   packaging cost, or margin per product.
2. **"What do I need to bake today?"** — orders live in scattered chat threads
   instead of one prioritized list.
3. **"Do I have enough of what I need?"** — no reliable view of ingredient
   stock until it runs out mid-bake.
4. **"How is the business actually doing?"** — no simple revenue/expense/profit
   picture without manually tallying receipts.
5. **"How do customers order from me?"** — no simple, no-account-needed way for
   a customer to browse and request an order.

## Core workflows

- **Set up a product**: define a product, its variants (sizes), a recipe, and
  get a suggested price based on cost + desired margin.
- **Take an order**: enter an order manually, or receive one from the public
  storefront, and move it through Pending → Confirmed → Preparing → Ready →
  Completed.
- **Plan a baking day**: see what needs to be baked today across all orders,
  check ingredient availability, and mark items done as they're produced.
- **Manage ingredients**: track stock, cost, and get warned before running out.
- **Record an expense** and see revenue, expenses, and profit over time.
- **Share a storefront link/QR** so customers can browse products and submit
  an order request without installing anything or creating an account.

## Main features

| Area | MVP | Later |
|---|---|---|
| Products & variants | Yes | Product photos, categories, bundles |
| Recipes & costing | Yes (cost calc + suggested price) | Recipe versioning, sub-recipes |
| Ingredients & inventory | Yes (stock, cost, low-stock) | Supplier tracking, purchase orders |
| Inventory movement history | Yes (basic log) | Full audit UI with filters |
| Orders (manual entry) | Yes | Recurring/standing orders |
| Order workflow & statuses | Yes | Automated reminders to customers |
| Production planning | Yes | Multi-day production calendar |
| Expenses | Yes | Receipt photo capture, categories reporting |
| Dashboard | Yes (today-focused) | Trends, forecasting |
| Reports | Basic (revenue/expenses/profit/margin) | Product performance, calendar financial view |
| Public storefront (browse + request order) | Yes | Storefront customization, multiple themes |
| Storefront order intake | Yes | Customer order status lookup page |
| Account/settings | Yes | Team members / multi-user access |
| Subscription/Premium | Placeholder only | Real billing integration, gated features |

## Important business rules

- The **baker** is the only authenticated user of the private app. Customers
  never need an account.
- A **product** is what a customer buys; a product **variant** is a specific
  size/option of that product with its own price. Costing and recipe-portion
  logic live at the **variant** level, since different sizes of the same
  product use different amounts of the recipe and different packaging.
- A **recipe** is an independent record (ingredients + quantities + yield). A
  variant references a recipe and how much of one recipe batch it consumes —
  this lets one recipe be reused across multiple variants or products (e.g.
  the same vanilla sponge recipe used in three different cakes).
- **Costing** = ingredient cost (from the recipe, scaled to the portion used)
  + packaging cost. The suggested price = cost ÷ (1 − desired margin %). The
  baker sets one default margin for their whole business, but can override it
  at the recipe, product, or variant level when a specific item's economics
  genuinely differ — the most specific setting always wins. The baker can
  also always override the final suggested price manually, regardless of
  margin.
- **Orders** always carry a status (Pending → Confirmed → Preparing → Ready →
  Completed, or Cancelled) and a payment status (Unpaid, or paid via GCash /
  Cash / Bank Transfer), independent of each other — an order can be
  Confirmed and Unpaid at the same time.
- **Storefront orders** always enter as **Pending** in the baker's app —
  nothing customer-submitted skips baker review.
- **Inventory** only changes through a recorded movement (restock, usage,
  adjustment, waste) — never a silent number edit — so there's always a
  history answering "what happened to my stock?"
- Production deducts inventory **per completed item**, not at order creation,
  so stock reflects what's actually been baked, not just what's been ordered.

## MVP vs. later — summary

**MVP** is everything a baker needs to replace their current spreadsheet +
Messenger workflow end-to-end: products/variants, recipes/costing,
ingredients/inventory with movement history, manual + storefront orders, the
order workflow, production planning, expenses, a focused dashboard, basic
reports, and the public storefront.

**Later**: anything that makes the MVP nicer but isn't required to run the
business day-to-day — photo-heavy product catalogs, recurring orders,
supplier/purchase-order tracking, forecasting, storefront theming, and real
subscription billing.
