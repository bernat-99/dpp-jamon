export function toIsoTimestamp(value?: bigint): string {
  if (value === undefined) {
    return 'n/d';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value.toString();
  }

  let millis: number;
  if (numeric > 1e14) {
    millis = Math.floor(numeric / 1_000);
  } else if (numeric > 1e12) {
    millis = numeric;
  } else {
    millis = numeric * 1_000;
  }

  return new Date(millis).toISOString();
}
