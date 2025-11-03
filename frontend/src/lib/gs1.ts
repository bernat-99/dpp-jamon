export interface Gs1Parts {
  gtin: string;
  lot: string;
  serial: string;
}

const RESOLVER_REGEX = /\/resolver\/01\/(\d{14})\/10\/([^/]+)\/21\/([^/?#]+)/i;

function decodeSegment(segment: string): string {
  return decodeURIComponent(segment.replace(/\+/g, ' '));
}

export function parseFromUrl(raw: string): Gs1Parts | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let path = trimmed;
  try {
    const url = new URL(trimmed);
    path = url.pathname;
  } catch {
    // not an absolute URL; keep as-is
  }

  const match = RESOLVER_REGEX.exec(path);
  if (!match) {
    return null;
  }

  return {
    gtin: match[1],
    lot: decodeSegment(match[2]),
    serial: decodeSegment(match[3]),
  };
}

export function buildResolverPath({ gtin, lot, serial }: Gs1Parts): string {
  return `/resolver/01/${gtin}/10/${encodeURIComponent(lot)}/21/${encodeURIComponent(serial)}`;
}

export function isValidGs1(parts: Gs1Parts): boolean {
  return /^\d{14}$/.test(parts.gtin) && parts.lot.trim().length > 0 && parts.serial.trim().length > 0;
}
