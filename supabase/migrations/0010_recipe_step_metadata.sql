-- Recipe instruction steps gain two optional fields: duration_minutes
-- and temperature_celsius, so a step can carry "5m" / "24°C" style
-- timing/temp info the same way a variant carries a price — not baked
-- into the step's free text. See docs/DECISIONS.md's 2026-08-25 "Recipe
-- step timer + temperature fields" entry.
--
-- Existing steps are plain strings, from the 2026-08-21 migration that
-- moved instructions to a jsonb array. Each one is wrapped into
-- { "text": <string>, "duration_minutes": null, "temperature_celsius":
-- null } below, so every row has ONE consistent shape going forward —
-- the app never has to branch on "is this element old-shape or
-- new-shape." NULL instructions stay NULL; already-object elements
-- (there shouldn't be any yet, but this makes the migration safe to
-- re-run) are left as-is.

update public.recipes
set instructions = (
  select jsonb_agg(
    case
      when jsonb_typeof(elem) = 'string'
        then jsonb_build_object(
          'text', elem #>> '{}',
          'duration_minutes', null,
          'temperature_celsius', null
        )
      else elem
    end
  )
  from jsonb_array_elements(instructions) as elem
)
where instructions is not null;
