-- Adds a free-text "intro" field to recipes -- the context/story text a
-- baker can optionally write above the numbered instruction steps
-- (e.g. "A rich savory soup my lola used to make"). Deliberately
-- separate from the `instructions` jsonb steps array rather than
-- special-casing the array's first element: the intro isn't a step
-- (no duration/temperature, never numbered, applies the same whether
-- the recipe is in Steps or One-block format), and repurposing
-- instructions[0] would have silently changed the meaning of every
-- existing recipe's real first step. See docs/DECISIONS.md's
-- "Instructions note-editor" entry.
--
-- `recipes` is already exposed via the Data API (2026-08-15 entry) --
-- adding a column to an already-exposed table needs no separate
-- exposure step, only this migration.

alter table public.recipes
  add column intro text;
