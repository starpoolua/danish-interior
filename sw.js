// Danish Interior — always check the server for pages.
// GitHub Pages sends "Cache-Control: max-age=600" for every file, so after a new
// deploy the browser keeps showing its saved copy of a page for up to 10 minutes
// (and longer when a tab is restored or the user goes Back). This worker makes
// page loads (and the small Nuxt payload/meta JSON) revalidate with the server
// every time; a 304 answer keeps it fast. Images, videos, fonts and scripts are
// untouched and keep using the normal browser cache.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        // a navigation must not be answered with a followed redirect: hand it back as a redirect
        return res.redirected ? Response.redirect(res.url, 302) : res;
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  if (/\/_payload[^/]*\.json$|\/_nuxt\/builds\//.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(function () { return fetch(req); }));
  }
});
