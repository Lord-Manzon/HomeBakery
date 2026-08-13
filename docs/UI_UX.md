# HomeBakery — UX Architecture

## Design principles

- Minimal, modern, calm, practical, professional but friendly, fast.
- Mobile-first; design for one-handed use — a baker may be holding the phone
  in one hand while working with the other.
- Use the right pattern for each situation (list, row, section, compact
  summary, bottom sheet, dialog, tabs, segmented control, chips, table) —
  **not every screen is a rounded card.**
- Avoid: unnecessary animation, generic "AI dashboard" look, over-designed
  analytics, too many steps for simple actions, decorative UI that doesn't
  help the workflow.
- Every screen needs: clear hierarchy, one obvious primary action, sensible
  secondary actions, and real empty/loading/error/validation/destructive-
  action states — not placeholders to fill in later.

## Navigation

Bottom tab bar, five destinations:

**Home · Orders · Production · Ingredients · More**

`More` holds: Products, Reports, Expenses, Storefront Settings, Theme,
Currency, Subscription, Account.

Product **costing** is not its own nav destination — it lives inside the
product/variant editing experience itself, next to the price it affects.

> This structure, and the feature designs below, came out of earlier design
> sessions on this project. They're carried forward as a **starting
> proposal, not a fixed requirement** — worth re-examining as each feature
> is actually designed in detail, and changing if a simpler or clearer
> structure emerges. Nothing here should be treated as locked in just
> because it was decided before.

## Screens by tab

**Home (dashboard)** — today-focused, no charts/analytics here:
1. Urgent alerts (e.g. low stock blocking today's orders, overdue orders)
2. "To bake today" — a checklist pulled from today's order items
3. Today's orders
4. A quiet stats strip (not the focus of the screen)

**Orders** — list of orders (filterable by status), order detail, new/edit
order form. Status moves through Pending → Confirmed → Preparing → Ready →
Completed, with Cancelled as an alternative state at any point before
Completed.

**Production** — the busy-day screen: what needs to be baked, grouped by
date/product, with quantities and ingredient-availability warnings. Marking
an item done updates `order_items.production_status` and triggers the
matching inventory deduction. Designed for minimal taps during active baking.

**Ingredients** — list with current stock and low-stock indicators, detail
view per ingredient (cost, stock, movement history), restock/adjust actions.

**More → Products** — product list, product detail with its variants,
variant editor (price, recipe, recipe portion, packaging cost) with the
costing/suggested-price panel inline.

**More → Reports** — revenue, expenses, profit, margin, product performance,
calendar-based financial view. Kept intentionally simple — not accounting
software.

**More → Expenses** — list + add/edit expense.

**More → Storefront Settings** — slug/URL, public on/off toggle, banner,
description, contact info, QR code display.

**More → Account** — baker profile, currency, timezone, theme, subscription.

## Public storefront

No app install, no account. Flow:

```
Storefront link/QR → Browse active products → Select product + variant
   → Enter order details (name, contact, pickup/delivery, schedule)
   → Submit request → Confirmation screen
```

The submitted order lands as a **Pending, storefront-sourced** order in the
baker's Orders tab — nothing customer-submitted bypasses baker review.

## Key flows to design in detail before building

1. **Create a product with variants, recipe, and costing** — the flow where a
   baker sets up a new product end-to-end, including the costing/suggested
   price panel.
2. **Take a manual order** — product/variant selection, quantity, schedule,
   fulfillment, payment.
3. **Run a production day** — from opening Production to marking items done.
4. **Storefront order** — the full customer-facing path above.

Each should be worked through screen-by-screen (goal, flow, primary/secondary
actions, empty/loading/error/confirmation states, edge cases) before any code
is written for it, per the project's usual process.
