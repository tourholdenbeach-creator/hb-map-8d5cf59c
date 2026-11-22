/* Holden Beach Map service worker.
   Bump CACHE_VERSION whenever the app shell changes so updates deploy. */
var CACHE_VERSION = "20261122d";
var SHELL = "hb-shell-" + CACHE_VERSION;
var TILES = "hb-tiles-" + CACHE_VERSION;

var PRECACHE = [
  "./",
  "./index.html",
  "./css/map.css",
  "./js/config.js",
  "./js/map.js",
  "./js/brief.js",
  "./js/pwa.js",
  "./manifest.json",
  "./favicon.ico",
  "./claim.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet.markercluster/leaflet.markercluster.js",
  "./vendor/leaflet.markercluster/MarkerCluster.css",
  "./vendor/leaflet.markercluster/MarkerCluster.Default.css",
  "./data/parks.geojson",
  "./data/landmarks.geojson",
  "./data/beach-accesses.geojson",
  "./data/restrooms.geojson",
  "./data/businesses.geojson",
  "./data/parking.geojson",
  "./tiles/clear.png",
  "./tiles/empty.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== SHELL && key !== TILES) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isSameOrigin(url) {
  return new URL(url, self.location.href).origin === self.location.origin;
}

function isTile(url) {
  return /\/tiles\//.test(url);
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = req.url;
  if (!isSameOrigin(url)) return;

  if (req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") >= 0) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match("./index.html");
        });
      })
    );
    return;
  }

  if (isTile(url)) {
    event.respondWith(
      caches.open(TILES).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetched = fetch(req).then(function (res) {
        if (res && res.ok) {
          caches.open(SHELL).then(function (c) { c.put(req, res.clone()); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fetched;
    })
  );
});
