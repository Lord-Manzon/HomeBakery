import { supabase } from './supabase';
import type { Product, ProductCategory, ProductVariant, ProductWithVariants } from '../types/product';
import type { ProductFormInput, VariantFormInput } from '../utils/validation/productSchemas';

async function getCurrentBakerId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('No authenticated user.');
  return id;
}

/**
 * Uploads a product photo to the "product-photos" Storage bucket (see
 * supabase/migrations/0006_product_photos_bucket.sql) under the current
 * baker's UUID folder, and returns its public URL. Per
 * docs/UI_UX_1.md section E.5a, callers should catch failures here
 * separately from the product save itself and offer "Save without
 * photo" rather than blocking the whole save.
 */
export async function uploadProductPhoto(localUri: string): Promise<string> {
  const bakerId = await getCurrentBakerId();
  const extension = localUri.split('.').pop()?.split('?')[0] || 'jpg';
  const path = `${bakerId}/${Date.now()}.${extension}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('product-photos')
    .upload(path, arrayBuffer, { contentType: `image/${extension}` });
  if (error) throw error;

  const { data } = supabase.storage.from('product-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Products list, each with its active variants attached (ordered by
 * display_order) — the Products list screen needs both in one call to
 * render each card's per-variant price chips (see
 * docs/DECISIONS.md's 2026-08-17 entry). Inactive products are excluded;
 * deactivating is a soft-delete (is_active = false) per
 * docs/UI_UX_1.md section E.5b, not a hard delete.
 */
export async function getProducts(): Promise<ProductWithVariants[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;

  return (data as (Product & { product_variants: ProductVariant[] })[]).map((p) => {
    const { product_variants, ...product } = p;
    return {
      ...product,
      variants: (product_variants ?? [])
        .filter((v) => v.is_active)
        .sort((a, b) => a.display_order - b.display_order),
    };
  });
}

export async function getProduct(id: string): Promise<Product> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Product;
}

/**
 * All of the baker's product categories, alphabetical — the source for
 * the category quick-pick chips on New Product and the Products list
 * filter row. Per docs/DECISIONS.md's 2026-08-18 entry, this replaced
 * deriving categories from distinct values already in use on products,
 * since a category (and its icon) needs to be able to exist before any
 * product uses it.
 */
export async function getProductCategories(): Promise<ProductCategory[]> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('baker_id', bakerId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data as ProductCategory[];
}

export async function createProductCategory(input: {
  name: string;
  icon: string;
}): Promise<ProductCategory> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('product_categories')
    .insert({ baker_id: bakerId, name: input.name, icon: input.icon })
    .select()
    .single();
  if (error) throw error;
  return data as ProductCategory;
}

export async function getVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data as ProductVariant[];
}

export async function createProduct(input: ProductFormInput): Promise<Product> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('products')
    .insert({
      baker_id: bakerId,
      name: input.name,
      category: input.category ?? null,
      image_url: input.image_url ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, input: ProductFormInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({
      name: input.name,
      category: input.category ?? null,
      image_url: input.image_url ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

/**
 * Soft-deletes a product (is_active = false) per docs/UI_UX_1.md section
 * E.5b — the product drops off the storefront (Phase 12) but existing
 * order history is untouched. Never a hard delete.
 */
export async function deactivateProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

/**
 * Adds a variant. Per docs/UI_UX_1.md section E.5c: the FIRST variant
 * added to a product automatically becomes the default (is_default =
 * true) since there's nothing else to default to yet; later variants
 * default to false. display_order is appended at the end.
 */
export async function createVariant(
  productId: string,
  input: VariantFormInput
): Promise<ProductVariant> {
  const existing = await getVariants(productId);
  const isFirst = existing.length === 0;
  const nextOrder = existing.length
    ? Math.max(...existing.map((v) => v.display_order)) + 1
    : 0;

  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      name: input.name,
      selling_price: input.selling_price,
      packaging_cost: input.packaging_cost ?? 0,
      is_default: isFirst,
      display_order: nextOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

export async function updateVariant(
  id: string,
  input: VariantFormInput
): Promise<ProductVariant> {
  const { data, error } = await supabase
    .from('product_variants')
    .update({
      name: input.name,
      selling_price: input.selling_price,
      packaging_cost: input.packaging_cost ?? 0,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

/**
 * Sets one variant as the default for its product, unsetting any other
 * default on the same product first — DB has no partial-unique
 * constraint enforcing "one default per product," so this is done as two
 * steps here rather than relied on at the DB layer. Per
 * docs/UI_UX_1.md's "make this the default" toggle, only shown once 2+
 * variants exist.
 */
export async function setDefaultVariant(productId: string, variantId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('product_variants')
    .update({ is_default: false })
    .eq('product_id', productId);
  if (clearError) throw clearError;

  const { error: setError } = await supabase
    .from('product_variants')
    .update({ is_default: true })
    .eq('id', variantId);
  if (setError) throw setError;
}

/** Soft-deletes a variant (is_active = false) — same inline-confirm
 * pattern as products, per docs/UI_UX_1.md section E.5c. */
export async function deactivateVariant(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_variants')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}
