export type Baker = {
  id: string;
  business_name: string | null;
  currency: string;
  timezone: string;
  default_margin_percent: number;
  theme_accent: string;
  theme_mode: 'light' | 'dark' | 'system';
  gauge_sensitivity: 'aggressive' | 'tight' | 'balanced' | 'relaxed';
  /** Whether checking a product off the Production checklist automatically
   * deducts its recipe's ingredients from inventory. See
   * supabase/migrations/0013_production_auto_deduct.sql and
   * src/services/production.ts. */
  auto_deduct_inventory: boolean;
  created_at: string;
  updated_at: string;
};

/** True once the baker has completed onboarding. */
export function hasCompletedOnboarding(baker: Baker | null | undefined): boolean {
  return !!baker?.business_name;
}