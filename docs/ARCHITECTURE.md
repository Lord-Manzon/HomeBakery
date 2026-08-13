# HomeBakery — Technical Architecture

Written in plain language on purpose. Every decision below has a "why" — read
that before questioning or changing the decision.

## Priorities (in order)

1. Stability — especially on Android, given the last project's crash
2. Android compatibility
3. Maintainability
4. Simplicity
5. Security
6. Good developer experience
7. Reasonable scalability
8. Minimal unnecessary dependencies

If two options are close, pick the simpler, more stable one — not the newer
or trendier one.

## Recommended stack

| Layer | Choice | Version (as of Aug 2026) |
|---|---|---|
| Framework | Expo (managed workflow, Expo Router) | SDK 57 |
| Runtime | React Native | 0.86 |
| UI library | React | 19.2 |
| Language | TypeScript (strict mode) | latest stable |
| Navigation | Expo Router (file-based, built on React Navigation internally) | bundled with SDK 57 |
| Styling | React Native's built-in `StyleSheet` API + a small shared design-tokens file | — |
| Server state / data fetching | TanStack Query (`@tanstack/react-query`) | latest stable |
| Local/UI state | React `useState` / `useContext` — no global state library | — |
| Forms | React Hook Form + Zod | latest stable |
| Backend | Supabase (Postgres + Auth + Storage + Row Level Security) | — |
| Testing | Jest + React Native Testing Library (unit/logic), Maestro (a few smoke E2E flows, added later) | — |
| Build & deploy | EAS Build + EAS Update, Google Play internal testing track first | — |

### Why Expo (SDK 57) instead of "bare" React Native

Expo gives us a managed build pipeline (EAS), over-the-air updates, and a
huge set of pre-built, well-maintained native modules (camera, image picker,
notifications, etc.) without hand-writing native Android/iOS code. Bare React
Native would mean maintaining native project files ourselves — more surface
area for the kind of native-build breakage that killed the last project.
Expo SDK 57 is the current stable release (React Native 0.86); we'll pin to
whatever is the current stable SDK at build time and upgrade one version at a
time, never skip versions.

### Why Expo Router instead of manually configuring React Navigation

Expo Router *is* React Navigation under the hood, arranged by your folder
structure instead of hand-written navigator config. Same stability, less
boilerplate, and it's what new Expo projects ship with by default — so it's
the best-supported path going forward. Since SDK 56, Expo Router owns
navigation imports directly (no importing `@react-navigation/*` packages
directly in app code), which we'll follow.

### Why plain `StyleSheet` instead of NativeWind (or another styling library)

**This is the most important decision in this document, because of what
happened last time.**

NativeWind worked in the web preview but caused a runtime/parsing crash on
Android that survived cache clears, config checks, and an Expo SDK version
change. NativeWind isn't just CSS-in-JS — it does build-time code generation
(a Babel/Metro transform that converts Tailwind-style class names into style
objects) that has to interoperate correctly with React Native's bundler and
the New Architecture. When that generation step misbehaves, it's hard to
debug and can break specifically on Android while working fine on web.

React Native's built-in `StyleSheet.create()` has none of that: no code
generation, no extra build step, no separate library to go out of sync with
Expo/React Native versions. It compiles to plain objects React Native already
understands natively. It's more verbose than utility classes, but "more
typing" is a much better trade than "mysterious Android crash." We'll offset
the verbosity with a small shared `theme.ts` (colors, spacing, typography,
radii) that components import, so we get consistency without a styling
framework.

*Alternatives considered:* `styled-components` / `styled-system` (adds a
runtime style-resolution layer — same category of risk as NativeWind, just a
different implementation) and Tamagui (powerful but heavy, with its own
compiler step — the opposite of what we want after a codegen-related crash).
Plain `StyleSheet` is the boring, safe choice, which is exactly what we want
right now.

### Why TanStack Query instead of Redux/Zustand/MobX

Almost everything in HomeBakery is server data living in Supabase (products,
orders, ingredients, etc.) — there's very little state that's *only* on the
device. TanStack Query handles fetching, caching, background refresh, and
loading/error state for that server data with very little code, and it's
purpose-built for exactly this. A global state library like Redux would mean
manually building the caching/loading/error handling TanStack Query already
does, for no real benefit at this app's size. Screen-local state (a form
being edited, a modal being open) just uses React's own `useState`.

### Why React Hook Form + Zod

Forms are everywhere in this app (products, recipes, orders, expenses).
React Hook Form keeps re-renders cheap and has a simple API; Zod defines a
validation schema once and we get both runtime validation and TypeScript
types from the same definition — so the form, the validation rules, and the
TypeScript types can't drift apart from each other.

### Why Supabase

Given throughout the product requirements: Postgres gives us real relational
integrity (foreign keys, constraints) which this domain needs (products →
variants → recipes → ingredients, orders → order items, etc.); Auth handles
the baker's login; Storage handles product photos; and **Row Level Security
(RLS)** lets us enforce "a baker can only see their own data" at the database
level, not just in app code — so even a bug in the app can't leak one baker's
orders to another. It also has a generous free tier appropriate for a solo
baker's app early on.

### Data flow

```
UI screen (Expo Router route)
   ↓ calls a typed function in src/services/*
TanStack Query (caches, dedupes, retries)
   ↓
Supabase client (auth-aware, RLS-enforced)
   ↓
Postgres (Supabase) — the single source of truth for data
```

Screens never call Supabase directly — they go through a small `services/`
layer (see folder structure) so business rules (like "costing = ingredient
cost ÷ margin") live in one place, not scattered across components, and can
be unit-tested without any UI involved.

### Security / RLS approach

- Every table that belongs to a baker has a `baker_id` column and an RLS
  policy restricting all operations to `baker_id = auth.uid()`.
- The public storefront is the one place non-authenticated (`anon`) access is
  needed. Instead of opening tables directly to `anon`, we expose only what's
  needed through narrow, purpose-built database functions (e.g. "get active
  products for storefront slug X" and "submit an order request for storefront
  slug X") — so an anonymous visitor can never read or write anything beyond
  exactly what the storefront needs.
- No secrets (API keys, service-role keys) ever ship in the app. The app only
  ever uses Supabase's public "anon" key, which is safe to expose because RLS
  is what actually protects the data.

### Local dev & testing on Android (given the history here)

- Use **Expo Go** for early day-to-day development — fastest reload loop.
- As soon as any native module is added that Expo Go doesn't support, switch
  to an **EAS development build** installed on a real Android device or
  emulator — this is also how we'll catch any Android-specific issue (like
  the NativeWind one) early, instead of discovering it late.
- Every feature phase (see ROADMAP.md) should be tested on an actual Android
  device build before being marked done, not just in Expo Go/web preview.

### Testing approach

Not full TDD — this is a solo-dev app and heavy test infrastructure would
slow things down more than it helps. Pragmatic layering instead:

- **Unit tests (Jest)** for anything that computes a number a baker will
  trust: recipe costing, suggested price, inventory deduction, order totals.
- **Component tests (React Native Testing Library)** for a handful of
  critical forms (product/variant form, order form) to catch validation
  regressions.
- **A few E2E smoke tests (Maestro)**, added once the core flows exist —
  covering "create an order → move it through the workflow → see it in
  production" and "storefront: browse → submit order request."

### Deployment

- **EAS Build** produces the Android build (and iOS later, if ever needed).
- **EAS Update** allows pushing JS-only fixes without a full store
  resubmission for minor issues.
- Ship to **Google Play's internal testing track** first, so the baker (and
  anyone else testing) can install it like a real app before it's public.
- Environments: a Supabase **development** project for local work, and a
  separate **production** project — never develop directly against
  production data.

## Folder structure

```
HomeBakery/
├── AGENTS.md
├── app/                        # Expo Router routes (file-based navigation)
│   ├── (auth)/                 # Login/signup screens (baker only)
│   ├── (tabs)/                 # Home, Orders, Production, Ingredients, More
│   │   ├── index.tsx           # Home/dashboard
│   │   ├── orders/
│   │   ├── production/
│   │   ├── ingredients/
│   │   └── more/
│   │       ├── products/
│   │       ├── reports/
│   │       ├── expenses/
│   │       ├── storefront-settings/
│   │       └── account/
│   └── storefront/[slug]/      # Public storefront (no auth required)
├── src/
│   ├── components/             # Shared, reusable UI components
│   ├── services/                # Business logic + Supabase calls (costing, orders, inventory…)
│   ├── hooks/                   # TanStack Query hooks per domain (useProducts, useOrders…)
│   ├── theme/                   # Design tokens: colors, spacing, typography
│   ├── types/                   # Shared TypeScript types (often generated from the DB schema)
│   └── utils/                   # Small pure helpers
├── supabase/
│   ├── migrations/              # SQL migration files (source of truth for the DB schema)
│   └── functions/               # Any storefront-facing database functions
├── docs/                        # PRODUCT.md, ARCHITECTURE.md, DATABASE.md, UI_UX.md,
│                                 # ROADMAP.md, DECISIONS.md, CODING_STANDARDS.md
└── tests/
```

Business logic lives in `src/services/`, not inside components — a component
calls `services/costing.ts` or `services/orders.ts`, it doesn't compute a
suggested price inline in JSX. That's what keeps logic unit-testable and
keeps UI code focused on UI.
