/**
 * Shared formatting helpers so currency and ordinals render consistently across
 * the Slack notification surfaces (and anywhere else that needs them).
 */

/**
 * Format a number as USD. By default whole dollars (no cents); pass
 * { cents: true } for line-item amounts that should show cents. Always uses
 * thousands separators.
 */
export function formatCurrency(amount: number, opts?: { cents?: boolean }): string {
  const fractionDigits = opts?.cents ? 2 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/**
 * Return n with its English ordinal suffix (1 -> "1st", 22 -> "22nd",
 * 13 -> "13th"). Handles the 11-13 special case the old inline logic got wrong.
 */
export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}
