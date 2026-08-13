# HomeBakery — Development Roadmap

Built incrementally: **Planning → Decision → Design → Implementation → Test →
Review → Document**, one phase at a time. No phase starts implementation
before its UX is designed (see UI_UX.md for the process).

The order below follows the priority given in the original brief, since it
matches the actual data dependencies (e.g. you can't design Orders before
Products/Variants exist).

| # | Phase | Goal | Depends on | Test before "done" | Definition of done |
|---|---|---|---|---|---|
| 1 | Project foundation | Working Expo app shell, folder structure, theme tokens, navigation skeleton (empty tab screens) | — | Runs on an Android device build, not just web preview | App boots, all 5 tabs navigate, no console errors |
| 2 | Auth & business ownership | Baker signup/login, one `bakers` row per account | Foundation | Login/logout, session persistence, RLS confirmed blocking cross-account access | A second test account cannot see the first account's (empty) data |
| 3 | Database & security foundation | Core tables + RLS policies migrated to Supabase | Auth | RLS manually tested per table (can't read/write another baker's row) | Every table from DATABASE.md exists with RLS on |
| 4 | Products & variants | Create/edit product + variants (no costing yet) | DB foundation | Create, edit, deactivate a product; variants save correctly | Baker can fully manage their product catalog |
| 5 | Ingredients & inventory | Ingredient CRUD, stock, movement log, low-stock indicator | DB foundation | Manual restock/adjustment produces a correct movement + updated stock | Baker can track what they have and what it costs |
| 6 | Recipes & costing | Recipe CRUD, link to variants, cost calculation, suggested price | Products, Ingredients | Costing math verified against hand-calculated examples | Suggested price panel matches manual calculation |
| 7 | Orders | Manual order entry, order list/detail, status workflow, payment status | Products/variants | Full status walk-through Pending→Completed, and Cancelled path | Baker can fully manage orders without the old spreadsheet |
| 8 | Production | Today/upcoming production view, shortage warnings, mark-done → inventory deduction | Orders, Ingredients | Marking done deducts correct ingredient quantities | Baker can run a full baking day from this screen alone |
| 9 | Expenses | Expense CRUD | DB foundation | Basic CRUD only | Baker can log expenses |
| 10 | Dashboard | Home tab: alerts, to-bake-today, today's orders, stats strip | Orders, Production, Ingredients | Reflects real data correctly at a glance | Baker's first screen answers "what do I need to do today" |
| 11 | Reports | Revenue/expenses/profit/margin, product performance, calendar view | Orders, Expenses | Totals verified against manual tally for a test data set | Baker can answer "how's the business doing" without spreadsheets |
| 12 | Public storefront | Storefront pages, `get_storefront`/`submit_storefront_order` functions, QR/link in Storefront Settings | Products, Orders | End-to-end: submit as anonymous visitor → appears as Pending order | Customer can order without an account or app install |
| 13 | Subscription/Premium | Placeholder plan display, `subscriptions` table wired to UI (no real billing yet) | Account/settings | Plan displays correctly, no payment flow required yet | Structure exists for future billing integration |
| 14 | Advanced features | Whatever surfaces as genuinely needed once the baker is using the MVP daily | MVP complete | Case-by-case | Case-by-case |

Each phase ends with: test → report what changed/what was tested/what's
outstanding → check whether docs need updating (see AGENTS.md) → move to the
next phase only after that's settled.
