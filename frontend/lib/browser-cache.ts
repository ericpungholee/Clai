const CACHE_PATH_PREFIX = "/__clai_cache__";

export function getStableCacheRequestUrl(namespace: string, key: string): string {
  const path = `${CACHE_PATH_PREFIX}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;

  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export function matchesStableCacheRequestPrefix(
  requestUrl: string,
  namespace: string,
  keyPrefix: string,
): boolean {
  try {
    const url = new URL(requestUrl);
    const expectedPrefix =
      `${CACHE_PATH_PREFIX}/${encodeURIComponent(namespace)}/${encodeURIComponent(keyPrefix)}`;
    return url.pathname.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

export async function hashString(value: string): Promise<string> {
  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
    return value
      .split("")
      .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
      .toString(36);
  }

  const data = new TextEncoder().encode(value);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
