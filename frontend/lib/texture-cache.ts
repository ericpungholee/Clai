/**
 * Two-tier texture caching for packaging panels
 *
 * Tier 1: Cache Storage API (persistent across reloads)
 * Tier 2: In-memory Map (stable blob URLs to prevent React re-render loops)
 */

import {
  getStableCacheRequestUrl,
  hashString,
  matchesStableCacheRequestPrefix,
} from "@/lib/browser-cache";

const CACHE_NAME = "packaging-textures";
const blobUrlCache = new Map<string, string>(); // cacheId -> stable blob URL
const activePanelCacheKey = new Map<string, string>(); // panelId -> latest cache key

async function getTextureCacheEntry(panelId: string, remoteUrl: string) {
  const urlHash = await hashString(remoteUrl);
  const cacheId = `texture_${panelId}_${urlHash}`;

  return {
    cacheId,
    cachePrefix: `texture_${panelId}_`,
    requestUrl: getStableCacheRequestUrl(CACHE_NAME, cacheId),
  };
}

/**
 * Get cached texture URL for a panel.
 * Returns a stable blob URL across calls for the same remote asset.
 *
 * @param panelId - Panel identifier (e.g., "front", "back", "body")
 * @param remoteUrl - Remote URL or base64 data URL from backend
 * @returns Stable blob URL that can be used in img src
 */
export async function getCachedTextureUrl(
  panelId: string,
  remoteUrl: string
): Promise<string> {
  const { cacheId, requestUrl } = await getTextureCacheEntry(panelId, remoteUrl);
  const previousCacheId = activePanelCacheKey.get(panelId);

  if (previousCacheId && previousCacheId !== cacheId) {
    await clearTextureCache(panelId);
  }

  if (blobUrlCache.has(cacheId)) {
    activePanelCacheKey.set(panelId, cacheId);
    return blobUrlCache.get(cacheId)!;
  }

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(requestUrl);

      if (cached) {
        const blob = await cached.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(cacheId, blobUrl);
        activePanelCacheKey.set(panelId, cacheId);
        return blobUrl;
      }
    } catch (error) {
      console.warn("Cache Storage not available, using in-memory cache only:", error);
    }
  }

  const response = await fetch(remoteUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Failed to fetch texture for ${panelId}: ${response.statusText}`);
  }

  const blob = await response.blob();

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(requestUrl, new Response(blob));
    } catch (error) {
      console.warn("Failed to store in Cache Storage, using in-memory cache only:", error);
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(cacheId, blobUrl);
  activePanelCacheKey.set(panelId, cacheId);
  return blobUrl;
}

/**
 * Clear cached texture for a specific panel or all panels.
 *
 * @param panelId - Optional panel ID. If not provided, clears all textures.
 */
export async function clearTextureCache(panelId?: string): Promise<void> {
  if (panelId) {
    const cachePrefix = `texture_${panelId}_`;

    for (const [cacheId, blobUrl] of blobUrlCache.entries()) {
      if (!cacheId.startsWith(cachePrefix)) {
        continue;
      }

      URL.revokeObjectURL(blobUrl);
      blobUrlCache.delete(cacheId);
    }

    activePanelCacheKey.delete(panelId);

    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();

        for (const request of requests) {
          if (matchesStableCacheRequestPrefix(request.url, CACHE_NAME, cachePrefix)) {
            await cache.delete(request);
          }
        }
      } catch (error) {
        console.warn("Failed to clear from Cache Storage:", error);
      }
    }
  } else {
    for (const blobUrl of blobUrlCache.values()) {
      URL.revokeObjectURL(blobUrl);
    }

    blobUrlCache.clear();
    activePanelCacheKey.clear();

    if (typeof caches !== "undefined") {
      try {
        await caches.delete(CACHE_NAME);
      } catch (error) {
        console.warn("Failed to clear Cache Storage:", error);
      }
    }
  }
}

/**
 * Preload a texture into cache without returning the blob URL.
 *
 * @param panelId - Panel identifier
 * @param remoteUrl - Remote URL or base64 data URL
 */
export async function preloadTexture(
  panelId: string,
  remoteUrl: string
): Promise<void> {
  await getCachedTextureUrl(panelId, remoteUrl);
}

