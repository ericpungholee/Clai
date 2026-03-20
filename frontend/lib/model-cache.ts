import {
  getStableCacheRequestUrl,
  hashString,
  matchesStableCacheRequestPrefix,
} from "@/lib/browser-cache";

const CACHE_NAME = "product-models";

// In-memory cache of iteration ID -> blob URL to avoid creating duplicates
const blobUrlCache = new Map<string, string>();

async function getModelCacheEntry(iterationId: string, remoteUrl: string) {
  const [iterationHash, urlHash] = await Promise.all([
    hashString(iterationId),
    hashString(remoteUrl),
  ]);

  const cacheId = `model_glb_${iterationHash}_${urlHash}`;
  return {
    cacheId,
    cachePrefix: `model_glb_${iterationHash}_`,
    requestUrl: getStableCacheRequestUrl(CACHE_NAME, cacheId),
  };
}

export async function getCachedModelUrl(iterationId: string, remoteUrl: string) {
  if (typeof window === "undefined" || !("caches" in window)) {
    return remoteUrl;
  }

  const { cacheId, requestUrl } = await getModelCacheEntry(iterationId, remoteUrl);

  // Check in-memory cache first to reuse existing blob URL
  if (blobUrlCache.has(cacheId)) {
    return blobUrlCache.get(cacheId)!;
  }

  const cache = await caches.open(CACHE_NAME);

  const cachedResponse = await cache.match(requestUrl);
  if (cachedResponse) {
    const blob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(blob);
    blobUrlCache.set(cacheId, blobUrl);
    return blobUrl;
  }

  const response = await fetch(remoteUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status}`);
  }

  await cache.put(requestUrl, response.clone());
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(cacheId, blobUrl);
  return blobUrl;
}

export async function clearCachedModel(iterationId: string) {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  const iterationHash = await hashString(iterationId);
  const cachePrefix = `model_glb_${iterationHash}_`;

  const keysToDelete: string[] = [];
  blobUrlCache.forEach((blobUrl, key) => {
    if (key.startsWith(cachePrefix)) {
      if (blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => blobUrlCache.delete(key));

  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  for (const request of requests) {
    if (matchesStableCacheRequestPrefix(request.url, CACHE_NAME, cachePrefix)) {
      await cache.delete(request);
    }
  }
}

export async function clearAllModelCache() {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }
  blobUrlCache.forEach((blobUrl) => {
    if (blobUrl.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrl);
    }
  });
  blobUrlCache.clear();
  await caches.delete(CACHE_NAME);
}

