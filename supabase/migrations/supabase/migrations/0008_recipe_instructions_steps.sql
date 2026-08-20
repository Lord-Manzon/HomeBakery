-- Changes recipes.instructions from a single text block to a jsonb array
-- of step strings, so a recipe can be written as numbered steps instead
-- of one paragraph. See docs/DECISIONS.md's 2026-08-21 "Recipe
-- instructions become step-based" entry for the full reasoning.
--
-- A free-text recipe (the old shape) is just an array with one element
-- under this new shape — the app's "One block" editor mode writes a
-- 1-item array, "Steps" mode writes multiple. No data is lost: every
-- existing instructions value is wrapped into a 1-item array below.
-- NULL stays NULL (recipes that never had instructions).

alter table public.recipes
  alter column instructions type jsonb
  using (
    case
      when instructions is null or trim(instructions) = '' then null
      else to_jsonb(array[instructions])
    end
  );