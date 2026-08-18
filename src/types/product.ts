export type Product = {
  id: string;
  baker_id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  margin_percent: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  recipe_id: string | null;
  name: string;
  recipe_portion: number | null;
  packaging_cost: number;
  margin_percent: number | null;
  selling_price: number;
  suggested_price: number | null;
  is_default: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** A product with its active variants attached — the shape the Products
 * list screen needs to render each card's price chips, per
 * docs/DECISIONS.md's 2026-08-17 entry (variant chips replace the
 * "N variants · price range" summary line). */
export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};

/** A baker-created product category with its chosen icon — see
 * supabase/migrations/0007_product_categories.sql and
 * docs/DECISIONS.md's 2026-08-18 entry. Color is deliberately not a
 * field here; it's derived from `name` at render time (see
 * src/utils/productCategoryIcon.ts) rather than stored. */
export type ProductCategory = {
  id: string;
  baker_id: string;
  name: string;
  icon: string;
  created_at: string;
};
