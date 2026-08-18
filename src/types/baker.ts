export type Baker = {
  id: string;
  business_name: string | null;
  currency: string;
  timezone: string;
  default_margin_percent: number;
  theme_accent: string;
  theme_mode: 'light' | 'dark' | 'system';
  gauge_sensitivity: 'aggressive' | 'tight' | 'balanced' | 'relaxed';
  created_at: string;
  updated_at: string;
};

/** True once the baker has completed onboarding. */
export function hasCompletedOnboarding(baker: Baker | null | undefined): boolean {
  return !!baker?.business_name;
}