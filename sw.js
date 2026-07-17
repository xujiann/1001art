/* 1001件人类艺术瑰宝 — Service Worker
   - 外壳（HTML/CSS/JS）：stale-while-revalidate
   - 本地图片（images/）：cache-first，按需缓存，离线可回看已浏览作品
*/
const SHELL = "art1001-shell-v52";
const IMGS  = "art1001-img-v12";
const IMG_CDN = "cdn.jsdelivr.net";   // 图片走 jsDelivr（xujiann/1001art-img）
const IMG_CAP = 1200;                 // 图片缓存上限，FIFO 淘汰，防 Cache Storage 无限增长触发整源清退
// 核心壳：小、离线首屏必需 → 原子缓存
const CORE_ASSETS = ["./", "./index.html", "./style.css", "./lang.js", "./data.js", "./app.js", "./manifest.webmanifest"];
// 大/可选资源（数据其余分片 + 懒加载元数据）：尽力缓存，单个失败不阻断安装
const EXTRA_ASSETS = ["./data-rest.js", "./desc.js", "./credits.js", "./artists.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL).then(c =>
      c.addAll(CORE_ASSETS).then(() => Promise.all(EXTRA_ASSETS.map(u => c.add(u).catch(() => {}))))
    ).then(() => self.skipWaiting())
  );
});

// 图片缓存 FIFO 淘汰：超上限则删最早写入的若干条
async function trimCache(cacheName, max){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if(keys.length <= max) return;
  for(let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

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

  // 图片：本地 images/ 或 jsDelivr CDN → cache-first（离线可回看已浏览作品）。
  // 跨域图先于同源判断处理。jsDelivr 带 CORS 头，用 cors 请求取回“真实”响应缓存
  // （避免 opaque 响应在 Cache Storage 的 padding 配额膨胀）；失败再回退原始请求。
  const isImg = url.pathname.includes("/images/") &&
    (url.origin === location.origin || url.hostname === IMG_CDN);
  if (isImg) {
    e.respondWith(
      caches.open(IMGS).then(cache =>
        cache.match(req).then(hit => hit || fetch(url.href, { mode: "cors" }).then(res => {
          if (res && res.ok) cache.put(req, res.clone()).then(() => trimCache(IMGS, IMG_CAP));
          return res;
        }).catch(() => fetch(req)))
      )
    );
    return;
  }

  if (url.origin !== location.origin) return; // 其余仅处理同源

  // 页面与数据：network-first（在线总是最新，离线回退缓存）
  const p = url.pathname;
  // 预渲染详情页（art/artist/museum，共 6000+ 页）：直连网络，不进壳缓存也不回退首页
  if (/\/(art|artist|museum)\/[^/]+\.html$/.test(p)) return;
  const isDoc = req.mode === "navigate" || p.endsWith("/") || p.endsWith("/index.html") || p.endsWith("/data.js") || p.endsWith("/data-rest.js");
  if (isDoc) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const cl = res.clone(); caches.open(SHELL).then(c => c.put(req, cl)); }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
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
