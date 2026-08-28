import { supabase } from './supabase';
import type { Baker } from '../types/baker';

/** Fetches the current user's baker profile. RLS guarantees it's theirs. */
export async function getBakerProfile(): Promise<Baker> {
  const { data, error } = await supabase.from('bakers').select('*').single();
  if (error) throw error;
  return data as Baker;
}

export type OnboardingInput = {
  business_name: string;
  currency: string;
  timezone: string;
};

/**
 * Fields updatable outside onboarding — currently just theme preference.
 * Added 2026-08-15 for the Appearance settings screen (accent color +
 * light/dark/system mode). See supabase/migrations/0003_baker_theme_preference.sql
 * and docs/DECISIONS.md.
 */
export type ThemePreferenceInput = {
  theme_accent: string;
  theme_mode: 'light' | 'dark' | 'system';
};

/**
 * Added 2026-08-16 for the ingredient stock gauge feature. See
 * supabase/migrations/0004_baker_gauge_sensitivity.sql and
 * docs/DECISIONS.md.
 */
export type GaugeSensitivityInput = {
  gauge_sensitivity: 'aggressive' | 'tight' | 'balanced' | 'relaxed';
};

/**
 * Added 2026-08-27 for the Production screen (Phase 8). See
 * supabase/migrations/0013_production_auto_deduct.sql and
 * docs/DECISIONS.md.
 */
export type ProductionPreferenceInput = {
  auto_deduct_inventory: boolean;
};

export async function completeOnboarding(input: OnboardingInput): Promise<Baker> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('No authenticated user.');

  const { data, error } = await supabase
    .from('bakers')
    .update(input)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Baker;
}

export async function updateBakerProfile(
  input: Partial<
    OnboardingInput & ThemePreferenceInput & GaugeSensitivityInput & ProductionPreferenceInput
  >
): Promise<Baker> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('No authenticated user.');

  const { data, error } = await supabase
    .from('bakers')
    .update(input)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Baker;
}