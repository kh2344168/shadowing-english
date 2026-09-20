export function roundTime(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampTime(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return Math.max(min, Math.min(max, value));
}
