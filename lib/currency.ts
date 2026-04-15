export function kToLira(amountInK: number): number {
  return amountInK * 1000;
}

export function liraToK(amountInLira: number): number {
  return amountInLira / 1000;
}

export function formatLira(amountInK: number): string {
  return `${Math.round(kToLira(amountInK)).toLocaleString()} L.L`;
}
