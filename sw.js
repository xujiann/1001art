/* 1001件人类艺术瑰宝 — Service Worker
   - 外壳（HTML/CSS/JS）：stale-while-revalidate
   - 本地图片（images/）：cache-first，按需缓存，离线可回看已浏览作品
*/
const SHELL = "art1001-shell-v12";
const IMGS  = "art1001-img-v3";
const SHELL_ASSETS = [
  "./", "./index.html", "./style.css", "./lang.js", "./data.js", "./artists.js", "./credits.js", "./app.js", "./manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== IMGS).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 仅处理同源

  // 页面与数据：network-first（在线总是最新，离线回退缓存）
  const p = url.pathname;
  const isDoc = req.mode === "navigate" || p.endsWith("/") || p.endsWith("/index.html") || p.endsWith("/data.js");
  if (isDoc) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const cl = res.clone(); caches.open(SHELL).then(c => c.put(req, cl)); }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // 图片：cache-first，命中即返回，未命中则取回并缓存
  if (url.pathname.includes("/images/")) {
    e.respondWith(
      caches.open(IMGS).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit))
      )
    );
    return;
  }

  // 外壳：stale-while-revalidate
  e.respondWith(
    caches.open(SHELL).then(cache =>
      cache.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
