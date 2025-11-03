import { buildResolverPath, type Gs1Parts, parseFromUrl, isValidGs1 } from "./gs1";

export interface ResolverResponse {
  id: {
    dynamic: string;
    locked: string;
  };
  gs1: {
    gtin: string;
    lot: string;
    serial: string | null;
  };
  state: {
    latest_cid: string | null;
    seq: number | null;
    version: number | null;
    created_at: string;
    last_state_change: string;
  };
  dynamic: {
    version: number | null;
    created_at: string;
    last_state_change: string;
  };
  locked: {
    cid: string | null;
    created_at: string;
  };
  verified: boolean;
  notes: string[];
  manifest: {
    fetched: boolean;
    data?: unknown;
  };
}

type ResolverInput = { url: string } | { parts: Gs1Parts };

const DEFAULT_TIMEOUT_MS = 10_000;

function getBaseUrl(): URL {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? window.location.origin;
  return new URL(base);
}

function buildTargetUrl(input: ResolverInput): URL {
  const baseUrl = getBaseUrl();

  if ("url" in input) {
    const raw = input.url.trim();
    if (!raw) {
      throw new Error("URL vacía.");
    }

    try {
      const asUrl = new URL(raw);
      if (asUrl.origin === baseUrl.origin) {
        return asUrl;
      }
      const parsedParts = parseFromUrl(asUrl.pathname);
      if (parsedParts && isValidGs1(parsedParts)) {
        return new URL(buildResolverPath(parsedParts), baseUrl);
      }
      throw new Error("URL externa no permitida.");
    } catch {
      if (raw.startsWith("/resolver/")) {
        return new URL(raw, baseUrl);
      }
      throw new Error("Formato de URL no soportado.");
    }
  }

  if (!isValidGs1(input.parts)) {
    throw new Error("Identificador GS1 inválido.");
  }

  return new URL(buildResolverPath(input.parts), baseUrl);
}

async function fetchWithTimeout(url: URL, timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchResolver(
  input: ResolverInput,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ResolverResponse> {
  const url = buildTargetUrl(input);
  let response = await fetchWithTimeout(url, DEFAULT_TIMEOUT_MS, signal);

  if (response.status === 502 && "url" in input && input.url) {
    response = await fetchWithTimeout(url, DEFAULT_TIMEOUT_MS, signal);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Identificador GS1 no encontrado (404).");
    }
    if (response.status === 502) {
      throw new Error("IPFS temporalmente no disponible (502).");
    }
    throw new Error(`Error del resolver (${response.status}).`);
  }

  return (await response.json()) as ResolverResponse;
}
