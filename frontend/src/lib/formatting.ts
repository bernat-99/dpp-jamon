export function truncHex(value: string | null | undefined, head = 10, tail = 6): string {
  if (!value) {
    return '—';
  }
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value || value === 'n/d') {
    return 'n/d';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  } catch {
    return value;
  }
}

export function formatSeq(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return value.toString();
}
