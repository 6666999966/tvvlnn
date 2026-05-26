const CACHE_VERSION = "tvvlnn-20260526-optimized-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const MEDIA_CACHE = `${CACHE_VERSION}-media`;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./背景图.jfif"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("tvvlnn-") && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isMediaAsset(url)) {
    event.respondWith(cacheFirstMedia(request, url));
  }
});

function isMediaAsset(url) {
  return /\.(?:jpg|jpeg|jfif|png|webp|mp3)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("./index.html", response.clone());
    return response;
  } catch {
    return await cache.match("./index.html");
  }
}

async function cacheFirstMedia(request, url) {
  const cache = await caches.open(MEDIA_CACHE);
  const cacheKey = url.href;
  const cached = await cache.match(cacheKey);

  if (cached) {
    return createRangeResponseIfNeeded(request, cached);
  }

  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    cache.put(cacheKey, response.clone());
  } else if (request.headers.has("range")) {
    warmFullMediaCache(cache, cacheKey);
  }
  return response;
}

function warmFullMediaCache(cache, cacheKey) {
  fetch(cacheKey)
    .then((response) => {
      if (response.ok && response.status === 200) {
        return cache.put(cacheKey, response);
      }
      return undefined;
    })
    .catch(() => {});
}

async function createRangeResponseIfNeeded(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;

  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return response;

  const blob = await response.blob();
  const size = blob.size;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  const sliced = blob.slice(start, end + 1);

  return new Response(sliced, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(sliced.size),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Type": response.headers.get("Content-Type") || "application/octet-stream"
    }
  });
}
