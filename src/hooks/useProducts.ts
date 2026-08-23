import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProduct,
  createProductCategory,
  createVariant,
  deactivateProduct,
  deactivateVariant,
  deleteProductCategory,
  duplicateProduct,
  getProduct,
  getProductCategories,
  getProducts,
  getVariants,
  setDefaultVariant,
  updateProduct,
  updateVariant,
  updateVariantRecipeLink,
  updateVariantSuggestedPrice,
  type DuplicateProductOptions,
} from '../services/products';
import type { ProductFormInput, VariantFormInput } from '../utils/validation/productSchemas';
import type { Product, ProductVariant } from '../types/product';

const productsKey = ['products'] as const;
const productKey = (id: string) => ['products', id] as const;
const variantsKey = (productId: string) => ['products', productId, 'variants'] as const;
const productCategoriesKey = ['productCategories'] as const;

export function useProducts() {
  return useQuery({ queryKey: productsKey, queryFn: getProducts });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: productKey(id), queryFn: () => getProduct(id), enabled: !!id });
}

export function useVariants(productId: string) {
  return useQuery({
    queryKey: variantsKey(productId),
    queryFn: () => getVariants(productId),
    enabled: !!productId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductFormInput) => createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductFormInput) => updateProduct(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(productKey(id), data);
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useDuplicateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      sourceVariants,
      options,
    }: {
      source: Product;
      sourceVariants: ProductVariant[];
      options: DuplicateProductOptions;
    }) => duplicateProduct(source, sourceVariants, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VariantFormInput) => createVariant(productId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: VariantFormInput }) =>
      updateVariant(variantId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useSetDefaultVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => setDefaultVariant(productId, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
    },
  });
}

export function useDeactivateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => deactivateVariant(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useProductCategories() {
  return useQuery({ queryKey: productCategoriesKey, queryFn: getProductCategories });
}

/**
 * Links/unlinks a recipe to a variant and sets its portion + margin
 * override — used by the real Phase 6 Recipe & costing screen. Product-
 * level and variant-level caches both need invalidating: the Products
 * list's per-variant price chips (and the product's own margin_percent
 * lookup) can be affected by a margin change here.
 */
export function useUpdateVariantRecipeLink(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      input,
    }: {
      variantId: string;
      input: { recipe_id: string | null; recipe_portion: number | null; margin_percent: number | null };
    }) => updateVariantRecipeLink(variantId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

/** Persists a freshly computed suggested_price for reference — see
 * docs/DATABASE.md. Silently no-ops the UI beyond a normal mutation;
 * nothing needs to visibly change since the caller already has the
 * number it just computed. */
export function useUpdateVariantSuggestedPrice(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, suggestedPrice }: { variantId: string; suggestedPrice: number | null }) =>
      updateVariantSuggestedPrice(variantId, suggestedPrice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
    },
  });
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; icon: string }) => createProductCategory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productCategoriesKey });
    },
  });
}

// Cascades: also clears `category` on every product that had this
// name, since deleteProductCategory() now does that server-side (see
// docs/DECISIONS.md's 2026-08-19 entry). productsKey is invalidated
// too — not just productCategoriesKey — so the Products list's card
// grid, its category filter chips, and any open Product Detail screen
// all reflect the cleared category, not just the category picker itself.
export function useDeleteProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string }) => deleteProductCategory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productCategoriesKey });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}