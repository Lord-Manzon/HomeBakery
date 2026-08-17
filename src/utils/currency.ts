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

export function formatCurrency(amount: number, currencyCode?: string | null): string {
  const symbol = currencyCode ? CURRENCY_SYMBOLS[currencyCode] : undefined;
  const value = amount.toFixed(2);
  return symbol ? `${symbol}${value}` : `${currencyCode ?? ''} ${value}`.trim();
}
