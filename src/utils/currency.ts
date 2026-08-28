/**
 * Maps a baker's stored `currency` code (docs/DATABASE.md: `bakers.currency`,
 * e.g. "PHP") to a display symbol. Falls back to the code itself (e.g.
 * "USD 12.00") for anything not in this small starter list, rather than
 * guessing at a symbol — safer than being wrong.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

// PHP is shown as whole pesos (₱20 not ₱20.00) -- centavos aren't
// meaningfully used in day-to-day baker pricing/orders, and dropping
// them keeps prices/totals reading cleaner across the app. Other
// currencies keep 2 decimal places, since USD/EUR/GBP cents are
// commonly used and rounding them away would be lossy for a baker
// pricing in one of those currencies.
const ZERO_DECIMAL_CURRENCIES = new Set(['PHP']);

export function formatCurrency(amount: number, currencyCode?: string | null): string {
  const symbol = currencyCode ? CURRENCY_SYMBOLS[currencyCode] : undefined;
  const isZeroDecimal = currencyCode ? ZERO_DECIMAL_CURRENCIES.has(currencyCode) : false;
  const value = isZeroDecimal ? Math.round(amount).toString() : amount.toFixed(2);
  return symbol ? `${symbol}${value}` : `${currencyCode ?? ''} ${value}`.trim();
}
