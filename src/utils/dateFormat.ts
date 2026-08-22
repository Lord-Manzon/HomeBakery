/**
 * Formats a Postgres `time` string ("HH:MM:SS" or "HH:MM") as a friendly
 * 12-hour clock time, e.g. "14:30:00" -> "2:30 PM". Returns null (not a
 * placeholder string) when there's no time set, so callers decide how to
 * render "no time" themselves rather than this util guessing a label.
 */
export function formatOrderTime(time: string | null): string | null {
  if (!time) return null;
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Formats a Postgres `date` string ("YYYY-MM-DD") for display on an order
 * card. "Today"/"Tomorrow" for the two dates a baker checks constantly;
 * everything else as a short weekday + date (e.g. "Mon, Aug 25") so a
 * baker scanning the "Upcoming" or "All" filter can tell WHEN at a
 * glance, not just that it's not today.
 *
 * Parses the "YYYY-MM-DD" pieces directly rather than `new Date(dateStr)`
 * -- the latter treats a bare date string as UTC midnight, which can
 * silently roll over to the wrong calendar day depending on the device's
 * timezone offset.
 */
export function formatOrderDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, tomorrow)) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "YYYY-MM-DD" for the device's current local date -- matches
 * src/services/orders.ts's todayDateString so a card's "is this
 * overdue?" check uses the exact same notion of "today" the list
 * filters already use. */
export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
