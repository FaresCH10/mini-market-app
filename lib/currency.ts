export function kToLira(amountInK: number): number {
  return amountInK * 1000;
}

export function liraToK(amountInLira: number): number {
  return amountInLira / 1000;
}

export function formatLira(amountInK: number): string {
  return `${Math.round(kToLira(amountInK)).toLocaleString()} L.L`;
}

/** Convert stored-K price to US dollars */
export function kToDollars(amountInK: number, ratePerDollar: number): number {
  return kToLira(amountInK) / ratePerDollar;
}

/** Format stored-K price as "$X.XX" */
export function formatDollar(amountInK: number, ratePerDollar: number): string {
  return `$${kToDollars(amountInK, ratePerDollar).toFixed(2)}`;
}
