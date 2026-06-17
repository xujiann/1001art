/* 1001件人类艺术瑰宝 — 交互逻辑（双语 / 高清灯箱 / 时间线索引） */
(function(){
  "use strict";
  const DATA = window.ART_DATA || [];
  const LANG = window.LANG || {ui:{zh:{},en:{}},dict:{}};
  const PER_PAGE = 48;
  const TOTAL = DATA.length;

  // —— 语言状态 ——
  let lang = (localStorage.getItem("art1001_lang") === "en") ? "en" : "zh";
  const T = k => (LANG.ui[lang] && LANG.ui[lang][k]) || (LANG.ui.zh[k] || k);
  // 取条目的当前语言字段
  const F = (d, base) => (lang === "en" && d[base + "_en"]) ? d[base + "_en"] : d[base];
  // 字段翻译（下拉/标签用：value 恒为中文，label 随语言）——映射从数据自身构建
  const TRMAP = { era:{}, medium:{}, country:{} };
  function buildTrMaps(){
    DATA.forEach(d => {
      if(d.era) TRMAP.era[d.era] = d.era_en || d.era;
      if(d.medium) TRMAP.medium[d.medium] = d.medium_en || d.medium;
      if(d.country) TRMAP.country[d.country] = d.country_en || d.country;
    });
  }
  function tr(kind, zh){ return (lang === "en" && TRMAP[kind] && TRMAP[kind][zh]) ? TRMAP[kind][zh] : zh; }

  // —— 时代 → 占位主题类（每条数据自带 th 主题后缀）——
  const eraTheme = d => "era-" + ((d && d.th) ? d.th : "default");

  // —— 图片：本地缓存优先；file 仅用于「查看原图」外链 ——
  const FP = "https://commons.wikimedia.org/wiki/Special:FilePath/";
  function originalURL(file){
    if(!file) return null;
    let f = file;
    try{ if(/%[0-9A-Fa-f]{2}/.test(file)) f = decodeURIComponent(file); }catch(e){}
    return FP + encodeURIComponent(f);
  }

  // —— 时间线分期 ——
  function periodKey(sy){
    if(sy < 0) return "bce";
    if(sy <= 1400) return "ancient";
    return "c" + (Math.floor((sy - 1) / 100) + 1);
  }
  function periodOrder(key){ return key === "bce" ? -1 : key === "ancient" ? 0 : parseInt(key.slice(1), 10); }
  function ordinal(n){ const s=["th","st","nd","rd"], v=n%100; return n + (s[(v-20)%10] || s[v] || s[0]); }
  function periodLabel(key){
    if(key === "bce") return T("bce");
    if(key === "ancient") return T("ancient");
    const c = parseInt(key.slice(1), 10);
    return lang === "zh" ? (c + " 世纪") : (ordinal(c) + " c.");
  }

  // —— 状态 ——
  let filtered = DATA.slice();
  let page = 0;
  let listView = false;
  let timelineMode = false;
  let periodFilter = null;
  let favOnly = false;
  let artistFilter = null;     // 选中的艺术家 key（artist_en）
  let artistIndexOn = false;   // 是否正在显示艺术家索引

  // —— 收藏（localStorage 持久化）——
  const FAV_KEY = "art1001_favs";
  let favs = new Set();
  try{ favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }catch(e){}
  const isFav = id => favs.has(id);
  function saveFavs(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); }catch(e){} }
  function toggleFav(id){ favs.has(id) ? favs.delete(id) : favs.add(id); saveFavs(); return favs.has(id); }

  // —— DOM ——
  const $ = id => document.getElementById(id);
  const gallery = $("gallery"), searchInput = $("search");
  const eraFilter = $("era-filter"), mediumFilter = $("medium-filter"), countryFilter = $("country-filter");
  const eraTabs = $("era-tabs"), timelineBar = $("timeline-bar");
  const pagination = $("pagination"), noResults = $("no-results");
  const artistIndex = $("artist-index"), artistBar = $("artist-bar");

  // —— 下拉选项（value=中文，label 随语言）——
  function uniq(key){
    const s = new Set();
    DATA.forEach(d => { if(d[key]) s.add(d[key]); });
    return [...s].sort((a,b)=>a.localeCompare(b,"zh"));
  }
  const eraVals = uniq("era"), mediumVals = uniq("medium"), countryVals = uniq("country");
  function buildSelect(sel, kind, vals, allKey){
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = T(allKey); sel.appendChild(o0);
    vals.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = tr(kind, v); sel.appendChild(o);
    });
  }
  function rebuildSelects(){
    const e=eraFilter.value, m=mediumFilter.value, c=countryFilter.value;
    buildSelect(eraFilter, "era", eraVals, "all_eras");
    buildSelect(mediumFilter, "medium", mediumVals, "all_media");
    buildSelect(countryFilter, "country", countryVals, "all_regions");
    eraFilter.value=e; mediumFilter.value=m; countryFilter.value=c;
  }

  // 统计
  $("era-count").textContent = eraVals.length;
  $("artist-count").textContent = uniq("artist").length;

  // —— 时代快捷标签 ——
  const eraCounts = {};
  DATA.forEach(d => eraCounts[d.era] = (eraCounts[d.era]||0)+1);
  const topEras = Object.keys(eraCounts).sort((a,b)=>eraCounts[b]-eraCounts[a]).slice(0,14);
  function buildTabs(){
    eraTabs.innerHTML = "";
    const all = document.createElement("button");
    all.className = "era-tab" + (eraFilter.value ? "" : " active");
    all.textContent = T("all");
    all.onclick = () => { eraFilter.value=""; applyFilters(); };
    eraTabs.appendChild(all);
    topEras.forEach(era => {
      const b = document.createElement("button");
      b.className = "era-tab" + (eraFilter.value===era ? " active" : "");
      b.textContent = `${tr("era",era)} (${eraCounts[era]})`;
      b.dataset.era = era;
      b.onclick = () => { eraFilter.value = era; applyFilters(); };
      eraTabs.appendChild(b);
    });
  }

  // —— 时间线索引条 ——
  const periodCounts = {};
  DATA.forEach(d => { const k=periodKey(d.sy); periodCounts[k]=(periodCounts[k]||0)+1; });
  const periodKeys = Object.keys(periodCounts).sort((a,b)=>periodOrder(a)-periodOrder(b));
  function buildTimelineBar(){
    timelineBar.innerHTML = "";
    periodKeys.forEach(k => {
      const b = document.createElement("button");
      b.className = "tl-period" + (periodFilter===k ? " active" : "");
      b.innerHTML = `<span class="tl-era">${esc(periodLabel(k))}</span><span class="tl-cnt">${periodCounts[k]}</span>`;
      b.onclick = () => { periodFilter = (periodFilter===k ? null : k); buildTimelineBar(); applyFilters(); };
      timelineBar.appendChild(b);
    });
  }

  // —— 按艺术家聚合 ——
  const artistAgg = (() => {
    const m = new Map();
    DATA.forEach(d => {
      const k = d.artist_en || d.artist;
      let a = m.get(k);
      if(!a){ a = {key:k, zh:d.artist, en:d.artist_en || d.artist, n:0, rep:null}; m.set(k, a); }
      a.n++; if(!a.rep && d.thumb) a.rep = d;
    });
    return [...m.values()].sort((x,y) => y.n - x.n || x.en.localeCompare(y.en));
  })();
  const artistName = a => (lang === "en" ? a.en : a.zh) || a.en;

  function renderArtistIndex(){
    const frag = document.createDocumentFragment();
    artistAgg.forEach(a => {
      const card = document.createElement("div");
      card.className = "artist-card"; card.tabIndex = 0;
      card.setAttribute("role","button"); card.setAttribute("aria-label", artistName(a));
      const open = () => selectArtist(a.key);
      card.onclick = open;
      card.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } };
      const thumb = (a.rep && a.rep.thumb)
        ? `<img loading="lazy" decoding="async" src="${a.rep.thumb}" alt="">`
        : `<div class="artist-noimg">❖</div>`;
      card.innerHTML = `<div class="artist-thumb">${thumb}</div>`+
        `<div class="artist-meta"><div class="artist-name">${esc(artistName(a))}</div>`+
        `<div class="artist-count">${a.n} ${esc(T("works"))}</div></div>`;
      frag.appendChild(card);
    });
    artistIndex.innerHTML = ""; artistIndex.appendChild(frag);
  }
  function showArtistIndex(){
    artistIndexOn = true; artistFilter = null;
    renderArtistIndex();
    artistIndex.style.display = "grid";
    artistBar.style.display = "none";
    gallery.style.display = "none"; pagination.innerHTML = ""; noResults.style.display = "none";
    eraTabs.style.display = "none"; timelineBar.classList.remove("show");
    $("artist-btn").classList.add("active");
    $("shown-count").textContent = artistAgg.length;
    syncURL();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function selectArtist(key){
    artistFilter = key; artistIndexOn = false;
    artistIndex.style.display = "none"; gallery.style.display = ""; eraTabs.style.display = "none";
    const a = artistAgg.find(x => x.key === key);
    artistBar.style.display = "flex"; artistBar.innerHTML = "";
    const back = document.createElement("button");
    back.className = "crumb"; back.innerHTML = "‹ " + esc(T("all_artists"));
    back.onclick = showArtistIndex;
    const cur = document.createElement("span");
    cur.className = "cur";
    cur.innerHTML = esc(a ? artistName(a) : key) + ` <small>${a ? a.n : 0} ${esc(T("artist_works"))}</small>`;
    artistBar.appendChild(back); artistBar.appendChild(cur);
    $("artist-btn").classList.add("active");
    applyFilters();
  }
  function exitArtist(){
    artistIndexOn = false; artistFilter = null;
    artistIndex.style.display = "none"; artistBar.style.display = "none";
    gallery.style.display = ""; eraTabs.style.display = "";
    $("artist-btn").classList.remove("active");
    applyFilters();
  }

  // —— 筛选 ——
  function applyFilters(){
    const q = searchInput.value.trim().toLowerCase();
    const fe = eraFilter.value, fm = mediumFilter.value, fc = countryFilter.value;
    filtered = DATA.filter(d => {
      if(artistFilter && (d.artist_en || d.artist) !== artistFilter) return false;
      if(favOnly && !favs.has(d.id)) return false;
      if(fe && d.era !== fe) return false;
      if(fm && d.medium !== fm) return false;
      if(fc && d.country !== fc) return false;
      if(periodFilter && periodKey(d.sy) !== periodFilter) return false;
      if(q){
        const hay = (d.title+" "+d.artist+" "+d.year+" "+d.era+" "+d.medium+" "+d.location+" "+
          (d.title_en||"")+" "+(d.artist_en||"")+" "+(d.era_en||"")+" "+(d.location_en||"")).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
    if(timelineMode) filtered.sort((a,b)=>a.sy-b.sy);
    page = 0;
    buildTabs();
    syncURL();
    render();
  }

  // —— 屏幕阅读器播报 ——
  function announce(msg){ const l=$("live"); if(l) l.textContent = msg; }

  // —— 渲染 ——
  function render(){
    $("shown-count").textContent = filtered.length;
    if(filtered.length === 0){
      gallery.innerHTML=""; pagination.innerHTML="";
      $("t-noresults").textContent = favOnly ? T("fav_empty") : T("no_results");
      noResults.style.display="block";
      announce(favOnly ? T("fav_empty") : T("no_results"));
      return;
    }
    announce(filtered.length + " " + T("works"));
    noResults.style.display = "none";
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if(page >= totalPages) page = totalPages - 1;
    const slice = filtered.slice(page*PER_PAGE, page*PER_PAGE + PER_PAGE);
    gallery.className = "gallery" + (listView ? " list-view" : "");
    const frag = document.createDocumentFragment();
    slice.forEach(d => frag.appendChild(makeCard(d)));
    gallery.innerHTML = ""; gallery.appendChild(frag);
    renderPagination(totalPages);
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function makeCard(d){
    const card = document.createElement("div");
    card.className = "art-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", F(d,"title") + " · " + F(d,"artist"));
    card.onclick = () => openModal(d);
    card.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openModal(d); } };
    const imgWrap = document.createElement("div");
    imgWrap.className = "card-img-wrap";
    if(d.thumb){
      imgWrap.classList.add("loading");
      const img = document.createElement("img");
      img.loading="lazy"; img.decoding="async"; img.alt=F(d,"title");
      img.src=d.thumb;
      img.onload = () => { img.classList.add("loaded"); imgWrap.classList.remove("loading"); imgWrap.classList.add("loaded"); };
      img.onerror = () => { imgWrap.classList.remove("loading"); imgWrap.innerHTML = placeholderHTML(d); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = placeholderHTML(d);
    }
    const num = document.createElement("div");
    num.className="card-num"; num.textContent="#"+d.id; imgWrap.appendChild(num);
    const fav = document.createElement("button");
    fav.className = "card-fav" + (isFav(d.id) ? " on" : "");
    fav.innerHTML = isFav(d.id) ? "♥" : "♡";
    fav.setAttribute("aria-label", T("fav"));
    fav.onclick = (e) => {
      e.stopPropagation();
      const on = toggleFav(d.id);
      fav.classList.toggle("on", on); fav.innerHTML = on ? "♥" : "♡";
      if(favOnly) applyFilters();
    };
    imgWrap.appendChild(fav);
    const body = document.createElement("div");
    body.className="card-body";
    body.innerHTML =
      `<div><div class="card-era">${esc(F(d,"era"))}</div>`+
      `<div class="card-title">${esc(F(d,"title"))}</div>`+
      `<div class="card-artist">${esc(F(d,"artist"))}</div>`+
      `<div class="card-year">${esc(F(d,"year"))}</div></div>`;
    card.appendChild(imgWrap); card.appendChild(body);
    return card;
  }

  function placeholderHTML(d){
    return `<div class="card-placeholder ${eraTheme(d)}">`+
      `<div class="ph-inner"><span class="ph-glyph">❖</span>`+
      `<span class="ph-title">${esc(F(d,"title"))}</span>`+
      `<span class="ph-artist">${esc(F(d,"artist"))}</span></div></div>`+
      `<div class="card-num">#${d.id}</div>`;
  }
  function wikiURL(d){
    return "https://en.wikipedia.org/w/index.php?search=" + encodeURIComponent(d.title_en + " " + d.artist_en);
  }

  function renderPagination(totalPages){
    pagination.innerHTML = "";
    if(totalPages <= 1) return;
    const mk = (label, p, opts={}) => {
      const b = document.createElement("button");
      b.className = "page-btn" + (opts.active ? " active" : "");
      b.textContent = label;
      if(opts.disabled) b.disabled = true; else b.onclick = () => { page=p; render(); };
      return b;
    };
    pagination.appendChild(mk("‹", page-1, {disabled: page===0}));
    const win=[], add=p=>{ if(p>=0&&p<totalPages&&!win.includes(p)) win.push(p); };
    add(0);add(1);for(let p=page-1;p<=page+1;p++)add(p);add(totalPages-2);add(totalPages-1);
    win.sort((a,b)=>a-b);
    let last=-1;
    win.forEach(p=>{
      if(p-last>1){ const dots=document.createElement("span"); dots.textContent="…"; dots.style.cssText="color:var(--text3);padding:0 4px;align-self:center"; pagination.appendChild(dots); }
      pagination.appendChild(mk(String(p+1), p, {active:p===page})); last=p;
    });
    pagination.appendChild(mk("›", page+1, {disabled: page===totalPages-1}));
  }

  // —— URL 状态同步（筛选 → 查询串，详情 → #art-id，皆可分享）——
  const modalOpen = () => $("modal").classList.contains("open");
  function currentModalId(){ return (modalOpen() && modalEntry) ? modalEntry.id : null; }
  function syncURL(){
    const p = new URLSearchParams();
    if(searchInput.value.trim()) p.set("q", searchInput.value.trim());
    if(eraFilter.value) p.set("era", eraFilter.value);
    if(mediumFilter.value) p.set("medium", mediumFilter.value);
    if(countryFilter.value) p.set("region", countryFilter.value);
    if(periodFilter) p.set("period", periodFilter);
    if(timelineMode) p.set("timeline", "1");
    if(favOnly) p.set("fav", "1");
    if(artistFilter) p.set("artist", artistFilter);
    else if(artistIndexOn) p.set("view", "artists");
    const qs = p.toString();
    const mid = currentModalId();
    const url = location.pathname + (qs ? ("?" + qs) : "") + (mid ? ("#art-" + mid) : "");
    try{ history.replaceState(null, "", url); }catch(e){}
  }
  function restoreFromURL(){
    const p = new URLSearchParams(location.search);
    if(p.get("q")) searchInput.value = p.get("q");
    if(p.get("era")) eraFilter.value = p.get("era");
    if(p.get("medium")) mediumFilter.value = p.get("medium");
    if(p.get("region")) countryFilter.value = p.get("region");
    if(p.get("period")) periodFilter = p.get("period");
    if(p.get("timeline") === "1"){ timelineMode = true; timelineBar.classList.add("show"); $("timeline-btn").classList.add("active"); }
    if(p.get("fav") === "1"){ favOnly = true; $("fav-only-btn").classList.add("active"); }
  }

  // —— 详情弹窗 ——
  let modalEntry = null, modalIndex = -1, lastFocus = null;
  function openModal(d){
    if(!modalOpen()) lastFocus = document.activeElement;   // 记住触发元素以便归还焦点
    modalEntry = d; modalIndex = filtered.indexOf(d);
    fillModal(d);
    $("modal").classList.add("open");
    document.body.style.overflow = "hidden";
    syncURL();
    setTimeout(() => { try{ $("modal-close").focus(); }catch(e){} }, 30);
  }
  function fillModal(d){
    modalEntry = d;
    const img=$("modal-img"), ph=$("modal-placeholder"), badge=$("zoom-badge");
    const wrap=$("modal-img-wrap");
    if(d.img){
      img.style.display="block"; img.src=d.img; img.alt=F(d,"title");
      ph.classList.remove("show"); badge.style.display="flex"; wrap.style.cursor="zoom-in";
      img.onerror = () => { img.style.display="none"; badge.style.display="none"; wrap.style.cursor="default"; showModalPlaceholder(d); };
    } else {
      img.style.display="none"; badge.style.display="none"; wrap.style.cursor="default"; showModalPlaceholder(d);
    }
    $("modal-era").textContent=F(d,"era");
    $("modal-title").textContent=F(d,"title");
    $("modal-artist").textContent=F(d,"artist");
    $("modal-year").textContent=F(d,"year");
    $("modal-medium").textContent=F(d,"medium");
    $("modal-location").textContent=F(d,"location");
    $("modal-country").textContent=F(d,"country");
    $("modal-desc").textContent=F(d,"desc");
    $("modal-num").textContent = lang==="zh" ? `第 ${d.id} / ${TOTAL} ${T("of_total")}` : `${d.id} / ${TOTAL}`;
    const mf = $("modal-fav");
    mf.classList.toggle("on", isFav(d.id));
    mf.innerHTML = (isFav(d.id) ? "♥ " : "♡ ") + T(isFav(d.id) ? "fav_on" : "fav");
    const al = $("modal-artist-link");
    const akey = d.artist_en || d.artist;
    if(artistFilter === akey){ al.style.display = "none"; }
    else { al.style.display = ""; al.textContent = T("more_by"); }
  }
  function showModalPlaceholder(d){
    const ph=$("modal-placeholder");
    ph.className="modal-img-placeholder show "+eraTheme(d);
    ph.innerHTML=
      `<span class="ph-glyph">❖</span>`+
      `<span class="mph-title">${esc(F(d,"title"))}</span>`+
      `<span class="mph-artist">${esc(F(d,"artist"))}</span>`+
      `<span class="mph-note">${esc(T("img_na"))}</span>`+
      `<a class="mph-wiki" href="${esc(wikiURL(d))}" target="_blank" rel="noopener">${esc(T("view_wiki"))} ↗</a>`;
  }
  function closeModal(){ $("modal").classList.remove("open"); document.body.style.overflow=""; syncURL(); try{ lastFocus && lastFocus.focus(); }catch(e){} }
  function navModal(dir){
    if(filtered.length===0) return;
    modalIndex=(modalIndex+dir+filtered.length)%filtered.length;
    modalEntry=filtered[modalIndex];
    fillModal(modalEntry);
    syncURL();
  }

  // —— 高清灯箱（缩放 / 平移）——
  const lb=$("lightbox"), lbImg=$("lb-img"), lbStage=$("lb-stage"), lbSpinner=$("lb-spinner");
  let scale=1, tx=0, ty=0, dragging=false, sx=0, sy=0, stx=0, sty=0, hintTimer;
  function lbApply(){ lbImg.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`; lbStage.classList.toggle("zoomed", scale>1); }
  function lbReset(){ scale=1; tx=0; ty=0; lbApply(); }
  function lbZoom(factor, cx, cy){
    const rect=lbImg.getBoundingClientRect();
    const ox=(cx==null?rect.width/2:cx-rect.left), oy=(cy==null?rect.height/2:cy-rect.top);
    const ns=Math.min(Math.max(scale*factor,1),8);
    if(ns===scale) return;
    tx-=ox*(ns/scale-1); ty-=oy*(ns/scale-1); scale=ns;
    if(scale===1){ tx=0; ty=0; }
    lbApply();
  }
  function openLightbox(d){
    if(!d || !d.img) return;
    lbReset();
    lbSpinner.classList.add("show");
    lbImg.onload=()=>lbSpinner.classList.remove("show");
    lbImg.onerror=()=>lbSpinner.classList.remove("show");
    lbImg.src=d.img; lbImg.alt=F(d,"title");
    $("lb-caption").textContent = F(d,"title")+" · "+F(d,"artist");
    const orig = originalURL(d.file);
    const ol = $("lb-original");
    if(orig){ ol.href = orig; ol.style.display=""; } else { ol.style.display="none"; }
    lb.classList.add("open");
    const hint=$("lb-hint"); hint.classList.remove("fade");
    clearTimeout(hintTimer); hintTimer=setTimeout(()=>hint.classList.add("fade"), 2600);
  }
  function closeLightbox(){ lb.classList.remove("open"); lbReset(); }

  lbStage.addEventListener("wheel", e=>{ e.preventDefault(); lbZoom(e.deltaY<0?1.15:0.87, e.clientX, e.clientY); }, {passive:false});
  lbStage.addEventListener("dblclick", e=>{ lbZoom(scale>1?0.001:2.4, e.clientX, e.clientY); });
  // 指针：单指拖动平移，双指捏合缩放
  const pts = new Map();
  let lastPinch = 0;
  lbStage.addEventListener("pointerdown", e=>{
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    lbStage.setPointerCapture(e.pointerId);
    if(pts.size===1 && scale>1){ dragging=true; lbStage.classList.add("grabbing"); sx=e.clientX; sy=e.clientY; stx=tx; sty=ty; }
    else if(pts.size===2){ dragging=false; lastPinch=0; }
  });
  lbStage.addEventListener("pointermove", e=>{
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size===2){
      const [a,b] = [...pts.values()];
      const dist = Math.hypot(a.x-b.x, a.y-b.y);
      if(lastPinch) lbZoom(dist/lastPinch, (a.x+b.x)/2, (a.y+b.y)/2);
      lastPinch = dist;
    } else if(dragging){ tx=stx+(e.clientX-sx); ty=sty+(e.clientY-sy); lbApply(); }
  });
  function lbPointerEnd(e){ pts.delete(e.pointerId); if(pts.size<2) lastPinch=0; if(pts.size===0){ dragging=false; lbStage.classList.remove("grabbing"); } }
  lbStage.addEventListener("pointerup", lbPointerEnd);
  lbStage.addEventListener("pointercancel", lbPointerEnd);
  $("lb-zoomin").onclick=()=>lbZoom(1.4); $("lb-zoomout").onclick=()=>lbZoom(0.7); $("lb-reset").onclick=lbReset; $("lb-close").onclick=closeLightbox;

  // —— 语言切换 ——
  function applyLang(){
    document.documentElement.lang = (lang==="en") ? "en" : "zh-CN";
    $("lang-toggle").textContent = T("lang_btn");
    $("t-sub").textContent = T("title_sub");
    $("t-subtitle").textContent = T("subtitle");
    $("t-works").textContent = T("works");
    $("t-eras").textContent = T("eras");
    $("t-artists").textContent = T("artists");
    searchInput.placeholder = T("search_ph");
    rebuildSelects();
    $("timeline-btn").textContent = timelineMode ? T("timeline_off") : T("timeline");
    $("fav-only-btn").innerHTML = "♥ " + T("fav_only");
    $("artist-btn").textContent = T("by_artist");
    $("random-btn").textContent = T("random");
    $("l-date").textContent = T("m_date");
    $("l-medium").textContent = T("m_medium");
    $("l-location").textContent = T("m_location");
    $("l-country").textContent = T("m_country");
    $("prev-art").textContent = T("prev");
    $("next-art").textContent = T("next");
    $("modal-share").title = T("share");
    $("t-original").textContent = T("view_original");
    $("lb-hint").textContent = T("zoom_hint");
    $("t-noresults").textContent = T("no_results");
    $("reset-btn").textContent = T("reset");
    $("t-footer").textContent = T("footer");
    buildTimelineBar();
    buildTabs();
    render();
    if(artistIndexOn) renderArtistIndex();
    else if(artistFilter) selectArtist(artistFilter);
    if($("modal").classList.contains("open") && modalEntry) fillModal(modalEntry);
  }
  $("lang-toggle").onclick = () => {
    lang = (lang==="en") ? "zh" : "en";
    localStorage.setItem("art1001_lang", lang);
    applyLang();
  };

  // —— 事件 ——
  let searchTimer;
  searchInput.addEventListener("input", ()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(applyFilters,180); });
  $("clear-search").onclick=()=>{ searchInput.value=""; applyFilters(); searchInput.focus(); };
  eraFilter.onchange=applyFilters; mediumFilter.onchange=applyFilters; countryFilter.onchange=applyFilters;
  $("timeline-btn").onclick=(e)=>{
    timelineMode=!timelineMode;
    e.target.classList.toggle("active", timelineMode);
    e.target.textContent = timelineMode ? T("timeline_off") : T("timeline");
    timelineBar.classList.toggle("show", timelineMode);
    if(!timelineMode){ periodFilter=null; buildTimelineBar(); }
    applyFilters();
  };
  $("fav-only-btn").onclick=(e)=>{
    favOnly=!favOnly;
    e.currentTarget.classList.toggle("active", favOnly);
    applyFilters();
  };
  $("artist-btn").onclick=()=>{ if(artistIndexOn || artistFilter) exitArtist(); else showArtistIndex(); };
  $("modal-fav").onclick=()=>{
    if(!modalEntry) return;
    const on=toggleFav(modalEntry.id);
    const mf=$("modal-fav");
    mf.classList.toggle("on", on); mf.innerHTML=(on?"♥ ":"♡ ")+T(on?"fav_on":"fav");
    if(favOnly) applyFilters();
  };
  $("modal-artist-link").onclick=()=>{
    if(!modalEntry) return;
    const key = modalEntry.artist_en || modalEntry.artist;
    closeModal();
    selectArtist(key);
  };
  $("modal-share").onclick=async()=>{
    try{ await navigator.clipboard.writeText(location.href); }catch(e){ return; }
    const b=$("modal-share"); const old=b.innerHTML; b.innerHTML="✓"; b.classList.add("done");
    announce(T("shared"));
    setTimeout(()=>{ b.innerHTML=old; b.classList.remove("done"); }, 1400);
  };
  $("random-btn").onclick=()=>{ if(filtered.length) openModal(filtered[Math.floor(Math.random()*filtered.length)]); };
  $("view-toggle").onclick=(e)=>{ listView=!listView; e.target.textContent=listView?"☰":"⊞"; render(); };
  $("modal-close").onclick=closeModal;
  $("prev-art").onclick=()=>navModal(-1);
  $("next-art").onclick=()=>navModal(1);
  $("modal-img-wrap").onclick=()=>{ if(modalEntry && modalEntry.img) openLightbox(modalEntry); };
  $("modal").addEventListener("click", e=>{ if(e.target===$("modal")) closeModal(); });
  document.addEventListener("keydown", e=>{
    if(lb.classList.contains("open")){
      if(e.key==="Escape") closeLightbox();
      else if(e.key==="+"||e.key==="=") lbZoom(1.4);
      else if(e.key==="-") lbZoom(0.7);
      else if(e.key==="0") lbReset();
      return;
    }
    if(!$("modal").classList.contains("open")) return;
    if(e.key==="Escape") closeModal();
    else if(e.key==="ArrowLeft") navModal(-1);
    else if(e.key==="ArrowRight") navModal(1);
    else if(e.key==="Tab"){   // 焦点陷阱：Tab 循环停留在弹窗内
      const box=$("modal").querySelector(".modal-box");
      const f=[...box.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
      if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });
  $("reset-btn").onclick = () => window.resetFilters();
  window.resetFilters = function(){
    searchInput.value=""; eraFilter.value=""; mediumFilter.value=""; countryFilter.value="";
    periodFilter=null; favOnly=false; $("fav-only-btn").classList.remove("active");
    artistFilter=null; artistIndexOn=false;
    artistIndex.style.display="none"; artistBar.style.display="none";
    gallery.style.display=""; eraTabs.style.display=""; $("artist-btn").classList.remove("active");
    buildTimelineBar(); applyFilters();
  };

  function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // —— 回到顶部 ——
  const toTop = $("to-top");
  window.addEventListener("scroll", () => { toTop.classList.toggle("show", window.scrollY > 600); }, {passive:true});
  toTop.onclick = () => window.scrollTo({top:0, behavior:"smooth"});

  // —— 深链：按 URL #art-<id> 打开对应作品 ——
  function openFromHash(){
    const m = location.hash.match(/^#art-(\d+)$/);
    if(!m){ if($("modal").classList.contains("open")) closeModal(); return; }
    const id = +m[1];
    if(modalEntry && modalEntry.id === id && $("modal").classList.contains("open")) return;
    const d = DATA.find(x => x.id === id);
    if(d) openModal(d);
  }
  window.addEventListener("hashchange", openFromHash);

  // —— 启动 ——
  buildTrMaps();
  applyLang();          // 构建下拉/标签/时间线，首次渲染
  restoreFromURL();     // 从 URL 恢复筛选状态
  buildTimelineBar();   // 反映恢复后的 period 高亮
  const wantId = (location.hash.match(/^#art-(\d+)$/) || [])[1];  // 先抓取深链 id（applyFilters 的 syncURL 会清掉 hash）
  applyFilters();       // 应用已恢复的筛选
  const _ap = new URLSearchParams(location.search);
  if(_ap.get("artist")) selectArtist(_ap.get("artist"));      // 恢复艺术家作品页
  else if(_ap.get("view") === "artists") showArtistIndex();   // 恢复艺术家索引
  if(wantId){ const d = DATA.find(x => x.id === +wantId); if(d) openModal(d); }
})();
