// Shared display formatters. Auto-imported via composables/shared (no prefix).
//
// Money is stored server-side as integer MINOR UNITS (cents). Per the revenue
// architecture, ALL currency formatting (minor units → display) happens in the
// FRONTEND — assume a single org currency, default USD. The server never emits
// a formatted money string.
export function useFormatters() {
  const nf = new Intl.NumberFormat("en-US");

  function formatNumber(n: number | null | undefined): string {
    return nf.format(Number(n || 0));
  }

  // Fraction in [0, 1] → "12.3%". Guards nullish.
  function formatPercent(fraction: number | null | undefined, digits = 1): string {
    return `${((fraction || 0) * 100).toFixed(digits)}%`;
  }

  function formatDate(d: string | Date | null | undefined): string {
    if (!d) return "—";
    const date = new Date(d);
    return isNaN(date.getTime())
      ? "—"
      : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  // Integer minor units (cents) → localized currency string, e.g. 4999 → "$49.99".
  // Unknown ISO codes fall back to a plain number with the code suffixed.
  function formatCurrency(minorUnits: number | null | undefined, currency = "USD"): string {
    const major = Number(minorUnits || 0) / 100;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(major);
    } catch {
      return `${nf.format(major)} ${currency}`;
    }
  }

  return { formatNumber, formatPercent, formatDate, formatCurrency };
}
