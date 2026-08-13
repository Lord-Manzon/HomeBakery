# HomeBakery — Coding Standards

## General

- TypeScript strict mode, everywhere. No `any` unless there's a commented
  reason it's genuinely unavoidable.
- Business logic (costing math, inventory deduction, order totals, status
  transition rules) lives in `src/services/`, never inline in a component.
  If a number appears on screen that a baker will trust, it should trace back
  to a small, named, unit-tested function.
- Components should be small and focused. If a screen file is doing data
  fetching, business math, *and* rendering, split it.
- Naming: `camelCase` for variables/functions, `PascalCase` for components
  and types, files match their default export's name.

## Styling

- `StyleSheet.create()` only. No inline style objects for anything reused
  more than once. No NativeWind, no CSS-in-JS runtime libraries (see
  DECISIONS.md for why).
- Colors, spacing, and typography come from `src/theme/` — no hardcoded hex
  colors or magic-number spacing in component files.

## Data & Supabase

- Screens/components call `src/hooks/` (TanStack Query hooks), which call
  `src/services/` — never call the Supabase client directly from a component.
- Never bypass RLS "for convenience." If something feels like it needs the
  service-role key on the client, that's a sign the feature needs a proper
  database function instead — ask before adding one.
- No secrets, keys, or credentials in client code, ever. Only the Supabase
  anon key belongs in the app.

## Forms & validation

- Every form has a Zod schema; the TypeScript type for that form's data is
  inferred from the schema, not hand-written separately.
- Validation errors are shown inline, next to the field, in plain language —
  not a generic toast.

## States (required for every screen, not optional polish)

- Loading state
- Empty state (with a clear next action, not just "no data")
- Error state (with a retry action where it makes sense)
- Validation state on every form
- Confirmation step before any destructive action (delete, cancel order,
  etc.)

## Dependencies

- Before adding a dependency: can this be done reasonably with what's already
  installed? If not, is this library actively maintained and Android/New
  Architecture compatible? Record the addition and reasoning in DECISIONS.md.
- No dependency added "because it's popular" — every addition needs a stated
  reason tied to an actual requirement.

## Testing

- Every function in `src/services/` that computes a number gets a Jest unit
  test.
- Critical forms get a React Native Testing Library test for their
  validation rules.
- New behavior should be testable on an Android device build, not assumed
  correct from web preview alone (see ARCHITECTURE.md — this is how the
  NativeWind issue was missed for so long last time).

## Commits & incremental work

- Small, reviewable changes over large ones.
- A phase from ROADMAP.md isn't "done" until it's been tested, reported on,
  and any documentation impact has been checked (see AGENTS.md).
