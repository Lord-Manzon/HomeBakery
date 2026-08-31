/**
 * Title-cases a name for display only -- e.g. "mama" -> "Mama".
 * Never call this before saving; it's a render-time transform, same as
 * formatCurrency/formatOrderTime elsewhere in src/utils/.
 */
export function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** First letter of a display name, for avatar initials. */
export function initialOf(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?';
}