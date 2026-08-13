# AGENTS.md — Instructions for AI agents working on HomeBakery

Read this fully before making any change. It points to where the real
documentation lives and states the rules that override any convenient
shortcut.

## What HomeBakery is

A business-management mobile app for home bakers — replacing the Facebook
posts, Messenger threads, notes, and spreadsheets a baker currently uses to
run orders, ingredients, expenses, and profit. The baker is the app's only
authenticated user; customers order through a public storefront link/QR
without an account. Full detail: `docs/PRODUCT.md`.

## Where the authoritative documentation lives

This repository is the single source of truth. Not a chat log, not a
separate notes app.

- `docs/PRODUCT.md` — what we're building and why
- `docs/ARCHITECTURE.md` — the stack, and why each piece was chosen
- `docs/DATABASE.md` — schema and RLS approach
- `docs/UI_UX.md` — navigation, screens, flows, design principles
- `docs/ROADMAP.md` — phase-by-phase build order
- `docs/DECISIONS.md` — running log of meaningful decisions and why they
  were made or changed
- `docs/CODING_STANDARDS.md` — how code in this repo is written

If something in the code contradicts these docs, the docs win — either the
code is wrong, or the docs are stale and need updating (see below). Don't
silently pick one.

## Hard architecture rules

- **No NativeWind.** The previous project's NativeWind setup caused an
  unresolved Android runtime crash. Styling uses React Native's built-in
  `StyleSheet` API only. See `docs/DECISIONS.md` for the full history — do
  not reintroduce NativeWind or a similar build-time styling codegen tool,
  even if asked, without first flagging the conflict with this rule.
- Android is a first-class target, not an afterthought. Test real behavior
  on an Android build (EAS dev build or device), not just Expo Go web
  preview — the last crash only showed up on Android.
- Business logic (costing, inventory deduction, order totals, status rules)
  lives in `src/services/`, never inline in a screen/component.
- RLS is never bypassed for convenience. If a feature seems to need it, stop
  and flag it — that usually means a proper database function is needed
  instead.
- No secrets or service-role keys in client code. Only the Supabase anon key
  belongs in the app.
- Don't add a dependency without a stated reason recorded in
  `docs/DECISIONS.md`. Don't add one "because it's popular."

How to hand off code changes

Match the delivery format to the size of the change — don't regenerate and resend the whole project for something small.

A one- or few-line fix in an existing file (dependency version pin, a config value, a typo): give the exact file path, then either "find <exact line> → replace with <exact line>" or the small snippet to add — not a full file re-paste, not a zip. The person should be able to open the file and make the edit in seconds without hunting for what changed.
A handful of files with real but contained changes: list each file path with just that file's new/changed content. Still no zip — the person can create/replace those specific files by hand.
A new phase, or any change touching many files/folders across the project structure: a zip is the right call here — reconstructing a multi-folder structure by hand from chat instructions costs more back-and- forth (and more tokens) than the zip itself.
Never re-zip and resend files that didn't change just because one file in the project did.
When giving a line-level fix, be unambiguous about location (file path, and enough surrounding context or an exact line to search for) — don't make the person guess at a line number that may have shifted.

## Coding standards

Full detail in `docs/CODING_STANDARDS.md`. In short: TypeScript strict mode,
Zod-validated forms, every screen has real loading/empty/error/validation/
confirmation states, small testable functions over clever inline logic.

## Testing expectations

Every function in `src/services/` that produces a number a baker will trust
(cost, price, totals, stock levels) needs a unit test. Critical forms get a
validation test. See `docs/CODING_STANDARDS.md` and `docs/ARCHITECTURE.md`
for the full testing approach.

## How to work incrementally

Follow `docs/ROADMAP.md`'s phase order. For each feature, follow:
**Planning → Decision → Design → Implementation → Test → Review → Document.**
Do not implement a feature's UI/UX design as you go — it should already be
designed (see `docs/UI_UX.md`'s process) before code is written. Do not build
multiple phases at once.

When a task is complete:
1. Test the work (including on an Android build where relevant).
2. Report what changed.
3. Report what was tested.
4. Report any remaining issues.
5. Identify whether any doc listed above needs updating.
6. If it does, ask: *"This changes/clarifies project documentation — update
   the relevant docs now?"* Don't update docs silently for a meaningful
   product or architecture decision.

## How to handle uncertain or missing requirements

Check `docs/PRODUCT.md` and `docs/DECISIONS.md` first — the answer may
already be settled. If it's genuinely not covered, don't guess silently:
propose a sensible option and ask, the same way product/UX decisions have
been made throughout this project. Small implementation details that don't
change product behavior are fine to decide directly, using
`docs/CODING_STANDARDS.md` as the guide.

## How to make and document a technical decision

1. State the decision plainly, and the reasoning behind it, in language a
   non-programmer can follow.
2. Note real alternatives considered and why they weren't chosen.
3. Add an entry to `docs/DECISIONS.md` (append, don't rewrite history).
4. If it changes something `docs/ARCHITECTURE.md` or `docs/DATABASE.md`
   currently says, update that doc too, and say so explicitly rather than
   letting the docs go stale.

## Security rules (non-negotiable)

- Every baker-owned table has RLS scoped to `baker_id = auth.uid()`.
- Anonymous storefront access goes only through the two purpose-built
  database functions described in `docs/DATABASE.md` — never direct table
  grants to `anon`.
- No client-side secrets, ever.
