-- Creates the "product-photos" Storage bucket for the New/Edit product
-- photo field (docs/UI_UX_1.md section E.5a), and RLS policies scoping
-- access the same way every other baker-owned table is scoped —
-- baker_id = auth.uid() — except here it's enforced via the object's
-- storage path rather than a baker_id column, since Storage objects
-- don't have arbitrary columns.
--
-- Path convention: every uploaded file is stored at
--   {baker_id}/{filename}
-- so a baker can only read/write objects under their own UUID folder.
-- This is the standard Supabase Storage RLS pattern for per-user folders.
--
-- Public bucket, since product photos are meant to be shown on the
-- future public storefront (Phase 12, docs/ROADMAP.md) — read access is
-- open to everyone, write access is restricted to the owning baker.

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

create policy "Product photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'product-photos');

create policy "Bakers can upload their own product photos"
  on storage.objects for insert
  with check (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Bakers can update their own product photos"
  on storage.objects for update
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Bakers can delete their own product photos"
  on storage.objects for delete
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
