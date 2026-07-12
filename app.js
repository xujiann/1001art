/* 1001件人类艺术瑰宝 — 交互逻辑（双语 / 高清灯箱 / 时间线索引） */
(function(){
  "use strict";
  const DATA = window.ART_DATA || [];
  const LANG = window.LANG || {ui:{zh:{},en:{}},dict:{}};
  const PER_PAGE = 48;
  let TOTAL = DATA.length;
  let ARTISTS = window.ART_ARTISTS || {};   // 艺术家小传 / 生卒 / 国籍（懒加载后重赋值）
  let CREDITS = window.ART_CREDITS || {};   // 逐图作者 / 许可署名（懒加载后重赋值）
  function lifespanStr(key){ const m=ARTISTS[key]; if(!m||(!m.born&&!m.died)) return ""; return (m.born||"?")+"–"+(m.died||(m.born?"":"?")); }
  function artistBio(key){ const m=ARTISTS[key]; if(!m) return null; return lang==="en" ? (m.bio_en||m.bio_zh) : (m.bio_zh||m.bio_en); }
  function artistCountry(key){ const m=ARTISTS[key]; if(!m) return ""; return lang==="en" ? (m.cty_en||m.cty_zh||"") : (m.cty_zh||m.cty_en||""); }
  function artistPortrait(key){ const m=ARTISTS[key]; return (m && m.p) ? imgURL(m.p) : null; }   // 艺术家肖像（懒加载后可用）

  // —— 语言状态 ——
  let lang = "zh";
  try{ if(localStorage.getItem("art1001_lang") === "en") lang = "en"; }catch(e){}   // 隐私模式 localStorage 可能抛错，兜底防整页白屏
  const T = k => (LANG.ui[lang] && LANG.ui[lang][k]) || (LANG.ui.zh[k] || k);
  // 取条目的当前语言字段
  const F = (d, base) => (lang === "en" && d[base + "_en"]) ? d[base + "_en"] : d[base];
  // 计数单位：英文单数去复数尾（"works"→"work"）；中文用量词不变
  function plu(n, key){ const w = T(key); return (lang === "en" && n === 1) ? w.replace(/s$/, "") : w; }
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

  // —— 图片 CDN 分片（jsDelivr，支持多图库仓无缝扩容）——
  // 图片存在独立仓，经 jsDelivr 分发；data.js 内存相对路径（images/<id>.<ext>），此处按 id 路由到对应仓再拼 CDN 前缀。
  // 单仓约 5GB 撞 GitHub 软上限（~13000 件）。扩容时：新建仓 1001art-img-N、把超界 id 的图推过去打标签，
  //   然后在下表把当前分片的 until 改成分界 id、追加一行新分片即可——前端零改动。
  // 迁移/换 CDN：改对应分片的 base。留空字符串数组则回退同源相对路径（本地调试）。
  // 肖像 images/a/<qid>.<ext>（无数字 id）恒落第一分片。
  const IMG_SHARDS = [
    { base: "https://cdn.jsdelivr.net/gh/xujiann/1001art-img@v6/", until: Infinity },
    // 扩容示例（届时取消注释并把上一行 until 改为分界 id，如 13000）：
    // { base: "https://cdn.jsdelivr.net/gh/xujiann/1001art-img-2@v1/", until: Infinity },
  ];
  const _idRe = /^images\/(?:t\/)?(\d+)\./;   // 从 images/<id>. 或 images/t/<id>. 提取 id
  function imgURL(p){
    if(!p) return p;
    let base = IMG_SHARDS.length ? IMG_SHARDS[0].base : "";
    const m = _idRe.exec(p);
    if(m){ const id = +m[1]; for(const s of IMG_SHARDS){ if(id <= s.until){ base = s.base; break; } } }
    return base + p;
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
  let museumIndexOn = false;   // 是否正在显示馆藏博物馆索引
  let artistIdxFilter = "";    // 索引（艺术家/博物馆）内的筛选词（共用）
  let idxSort = "count";       // 索引排序：count（按数量）| name（按名称）
  let museumFilter = null;     // 选中的馆藏地（藏品展）

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
  let eraVals = [], mediumVals = [], countryVals = [];
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

  // 统计（值在 computeDerived 后更新）
  function updateStats(){ $("era-count").textContent = eraVals.length; $("artist-count").textContent = uniq("artist").length; }

  // —— 时代快捷标签（计数在 computeDerived 中构建）——
  let eraCounts = {}, topEras = [];
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
  let periodCounts = {}, periodKeys = [];
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
  let artistAgg = [], artistByKey = new Map();
  function buildArtistAgg(){
    const m = new Map();
    DATA.forEach(d => {
      const k = d.artist_en || d.artist;
      let a = m.get(k);
      if(!a){ a = {key:k, zh:d.artist, en:d.artist_en || d.artist, n:0, rep:null, works:[]}; m.set(k, a); }
      a.n++; a.works.push(d); if(!a.rep && d.thumb) a.rep = d;
    });
    artistAgg = [...m.values()].sort((x,y) => y.n - x.n || x.en.localeCompare(y.en));
    artistByKey = m;   // key → 聚合（含 works[]），供弹窗「相关作品」O(该艺术家) 查表
  }
  // 数据清洗：个别作品的 artist/location 字段残留 Wikidata 空节点(genid)或裸 URL，
  // 会以链接文本形式出现在弹窗与索引里。就地归一为「佚名/未知收藏」等，幂等，兼防未来重建回归。
  const _BADVAL = /^https?:|\.well-known\/genid\/|^Q\d+$/i;   // 裸 URL / Wikidata 空节点 / 裸 QID 皆为脏值
  const _QID_NAME = {   // 已知 QID → 正确名称（艺术家 + 高频博物馆）
    "Q41554":"Nicolas Poussin", "Q168659":"Franz Xaver Winterhalter",
    "Q214867":"National Gallery", "Q1117704":"Indianapolis Museum of Art",
    "Q2148186":"RISD Museum", "Q847508":"Worcester Art Museum"
  };
  function sanitizeData(){
    // 先按中文馆藏名收集各馆真实英文名，供被清洗的 location_en 回填（否则整馆英文名会退化成中文/未知）
    const goodEn = new Map();
    for(const d of DATA){
      if(d.location && d.location_en && !_BADVAL.test(d.location_en) && d.location_en !== d.location && !goodEn.has(d.location))
        goodEn.set(d.location, d.location_en);
    }
    for(const d of DATA){
      if(d.artist && _BADVAL.test(d.artist)) d.artist = "佚名";
      if(d.artist_en && _BADVAL.test(d.artist_en)) d.artist_en = _QID_NAME[d.artist_en] || (d.id === 1651 ? "Jan van Eyck" : (d.artist && d.artist !== "佚名") ? d.artist : "Anonymous");
      if(d.location && _BADVAL.test(d.location)) d.location = "未知收藏";
      if(d.location_en && _BADVAL.test(d.location_en)) d.location_en = _QID_NAME[d.location_en] || goodEn.get(d.location) || (d.location && d.location !== "未知收藏" ? "" : "Unknown collection");
      if(d.title) d.title = d.title.replace(/\s{2,}/g, " ").trim();                    // 折叠多余空格
      if(d.title_en){ d.title_en = d.title_en.replace(/\s{2,}/g, " ").trim(); if(d.artist_en === "Albrecht Dürer") d.title_en = d.title_en.replace("Great Passion", "Large Passion"); }
      // Dürer 的《受难》《启示录》等版画组画被误标为「布面油画」→ 高置信修正为版画
      if(d.artist_en === "Albrecht Dürer" && /oil on canvas/i.test(d.medium_en || "") &&
         (/print/i.test((d.location || "") + (d.location_en || "")) || /Passion|Apocalypse/i.test(d.title_en || ""))){
        d.medium = "版画"; d.medium_en = "Print";
      }
    }
  }
  // 重算所有 DATA 派生结构（首屏一次；其余数据流式合并后再调一次）
  function computeDerived(){
    sanitizeData();
    buildTrMaps();
    eraVals = uniq("era"); mediumVals = uniq("medium"); countryVals = uniq("country");
    eraCounts = {}; DATA.forEach(d => eraCounts[d.era] = (eraCounts[d.era]||0)+1);
    topEras = Object.keys(eraCounts).sort((a,b)=>eraCounts[b]-eraCounts[a]).slice(0,14);
    periodCounts = {}; DATA.forEach(d => { const k=periodKey(d.sy); periodCounts[k]=(periodCounts[k]||0)+1; });
    periodKeys = Object.keys(periodCounts).sort((a,b)=>periodOrder(a)-periodOrder(b));
    buildArtistAgg();
    buildMuseumAgg();
    TOTAL = DATA.length;
    updateStats();
  }
  let museumAgg = [];
  const MU_SKIP = { "未知收藏":1, "私人收藏":1, "Private collection":1 };   // 占位归组，非真实机构，不进索引
  function buildMuseumAgg(){
    const m = new Map();
    DATA.forEach(d => {
      if(!d.location || MU_SKIP[d.location]) return;
      let a = m.get(d.location);
      if(!a){ a = {name:d.location, en:d.location_en || d.location, n:0, rep:null}; m.set(d.location, a); }
      a.n++; if(!a.rep && d.thumb) a.rep = d;
    });
    museumAgg = [...m.values()].sort((x,y) => y.n - x.n || x.name.localeCompare(y.name,"zh"));
  }
  const artistName = a => (lang === "en" ? a.en : a.zh) || a.en;

  function renderArtistIndex(){
    const q = artistIdxFilter;
    let list = q ? artistAgg.filter(a => ((a.zh||"") + " " + (a.en||"") + " " + a.key).toLowerCase().includes(q)) : artistAgg;
    if(idxSort === "name") list = list.slice().sort((a,b) => artistName(a).localeCompare(artistName(b), "zh"));
    const frag = document.createDocumentFragment();
    list.forEach(a => {
      const card = document.createElement("div");
      card.className = "artist-card"; card.tabIndex = 0;
      card.setAttribute("role","button"); card.setAttribute("aria-label", artistName(a));
      const open = () => selectArtist(a.key);
      card.onclick = open;
      card.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } };
      const pImg = artistPortrait(a.key);
      const thumb = pImg
        ? `<img class="artist-portrait" loading="lazy" decoding="async" src="${pImg}" alt="">`
        : (a.rep && a.rep.thumb)
          ? `<img loading="lazy" decoding="async" src="${imgURL(a.rep.thumb)}" alt="">`
          : `<div class="artist-noimg">❖</div>`;
      const ls = lifespanStr(a.key);
      card.innerHTML = `<div class="artist-thumb">${thumb}</div>`+
        `<div class="artist-meta"><div class="artist-name">${esc(artistName(a))}</div>`+
        (ls ? `<div class="artist-life">${esc(ls)}</div>` : "")+
        `<div class="artist-count">${a.n} ${esc(plu(a.n, "works"))}</div></div>`;
      frag.appendChild(card);
    });
    artistIndex.innerHTML = ""; artistIndex.appendChild(frag);
    $("artist-filter-count").textContent = q ? `${list.length} / ${artistAgg.length}` : "";
    if(artistIndexOn){ $("shown-count").textContent = list.length; $("t-works").textContent = plu(list.length, "artists"); }  // 计的是艺术家数
  }
  function showArtistIndex(){
    clearMuseum();
    artistIndexOn = true; museumIndexOn = false; artistFilter = null;
    $("museum-btn").classList.remove("active");
    artistIdxFilter = ""; { const fi = $("artist-filter"); if(fi){ fi.value = ""; fi.placeholder = T("filter_artist"); } }
    $("artist-index-bar").style.display = "flex";
    renderArtistIndex();
    if(!_metaLoaded) loadMeta().then(() => { if(artistIndexOn) renderArtistIndex(); });  // artists.js 到达后补生卒年
    artistIndex.style.display = "grid";
    artistBar.style.display = "none"; $("artist-header").style.display = "none";
    gallery.style.display = "none"; pagination.innerHTML = ""; noResults.style.display = "none";
    eraTabs.style.display = "none"; timelineBar.classList.remove("show");
    $("artist-btn").classList.add("active");
    syncURL();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function clearMuseum(){ museumFilter = null; $("museum-bar").style.display = "none"; $("museum-header").style.display = "none"; }
  function selectArtist(key){
    clearMuseum();
    artistFilter = key; artistIndexOn = false; museumIndexOn = false;
    $("museum-btn").classList.remove("active");
    if(!_metaLoaded) loadMeta().then(() => { if(artistFilter === key) selectArtist(key); });  // artists.js 到达后补小传
    artistIndex.style.display = "none"; $("artist-index-bar").style.display = "none"; gallery.style.display = ""; eraTabs.style.display = "none";
    timelineBar.classList.remove("show");   // 专辑视图不显示时间线条
    const a = artistAgg.find(x => x.key === key);
    artistBar.style.display = "flex"; artistBar.innerHTML = "";
    const back = document.createElement("button");
    back.className = "crumb"; back.innerHTML = "‹ " + esc(T("all_artists"));
    back.onclick = showArtistIndex;
    const cur = document.createElement("span");
    cur.className = "cur";
    cur.innerHTML = esc(a ? artistName(a) : key) + ` <small>${a ? a.n : 0} ${esc(plu(a ? a.n : 0, "artist_works"))}</small>`;
    artistBar.appendChild(back); artistBar.appendChild(cur);
    // 艺术家小传头图
    const hdr = $("artist-header");
    const bio = artistBio(key), ls = lifespanStr(key), cty = artistCountry(key);
    const sub = [ls, cty].filter(Boolean).join(" · ");
    const alt = a ? (lang === "en" ? a.zh : a.en) : "";
    const pCover = artistPortrait(key);
    const cover = pCover
      ? `<img class="ah-cover artist-portrait" loading="lazy" decoding="async" src="${pCover}" alt="">`
      : (a && a.rep && a.rep.thumb)
        ? `<img class="ah-cover" loading="lazy" decoding="async" src="${imgURL(a.rep.thumb)}" alt="">`
        : `<div class="ah-cover ah-noimg">❖</div>`;
    hdr.innerHTML = cover +
      `<div class="ah-info">`+
        `<div class="ah-name">${esc(a ? artistName(a) : key)}</div>`+
        (alt && alt !== (a ? artistName(a) : key) ? `<div class="ah-altname">${esc(alt)}</div>` : "")+
        (sub ? `<div class="ah-sub">${esc(sub)}</div>` : "")+
        (bio ? `<p class="ah-bio">${esc(bio)}</p>` : "")+
        `<div class="ah-count">${a ? a.n : 0} ${esc(plu(a ? a.n : 0, "artist_works"))}</div>`+
      `</div>`;
    hdr.style.display = "flex";
    $("artist-btn").classList.add("active");
    applyFilters();
  }
  function exitArtist(){
    artistIndexOn = false; museumIndexOn = false; artistFilter = null;
    artistIndex.style.display = "none"; $("artist-index-bar").style.display = "none"; artistBar.style.display = "none"; $("artist-header").style.display = "none";
    $("museum-btn").classList.remove("active");
    gallery.style.display = ""; eraTabs.style.display = "";
    timelineBar.classList.toggle("show", timelineMode);   // 回到画廊：时间线条与开关状态一致
    $("artist-btn").classList.remove("active");
    applyFilters();
  }

  // —— 馆藏地：某某美术馆藏品展 ——
  const muLabel = d => (lang === "en" ? (d.location_en || d.location) : d.location);
  function selectMuseum(name){
    if(!name || name === "未知收藏") return;
    exitArtist();                       // 退出艺术家视图（互斥）
    museumFilter = name;
    eraTabs.style.display = "none"; gallery.style.display = "";
    timelineBar.classList.remove("show");   // 藏品展视图不显示时间线条
    const works = DATA.filter(d => d.location === name);
    const rep = works.find(d => d.thumb);
    const enName = works[0] ? (works[0].location_en || "") : "";
    const dispName = lang === "en" ? (enName || name) : name;
    const alt = lang === "en" ? name : (enName && enName !== name ? enName : "");
    const bar = $("museum-bar"); bar.style.display = "flex"; bar.innerHTML = "";
    const back = document.createElement("button");
    back.className = "crumb"; back.textContent = T("back_all"); back.onclick = exitMuseum;
    bar.appendChild(back);
    const hdr = $("museum-header");
    const cover = (rep && rep.thumb)
      ? `<img class="ah-cover" loading="lazy" decoding="async" src="${imgURL(rep.thumb)}" alt="">`
      : `<div class="ah-cover ah-noimg">❖</div>`;
    hdr.innerHTML = cover +
      `<div class="ah-info">`+
        `<div class="ah-name">${esc(dispName)}</div>`+
        (alt && alt !== dispName ? `<div class="ah-altname">${esc(alt)}</div>` : "")+
        `<div class="ah-sub">${esc(T("exhibit"))}</div>`+
        `<div class="ah-count">${works.length} ${esc(plu(works.length, "artist_works"))}</div>`+
      `</div>`;
    hdr.style.display = "flex";
    applyFilters();
  }
  function exitMuseum(){
    museumFilter = null;
    $("museum-bar").style.display = "none"; $("museum-header").style.display = "none";
    gallery.style.display = ""; eraTabs.style.display = "";
    timelineBar.classList.toggle("show", timelineMode);
    applyFilters();
  }
  // —— 按馆藏博物馆索引（复用艺术家索引网格）——
  function renderMuseumIndex(){
    const q = artistIdxFilter;
    // 默认只列 ≥2 件的真实馆藏（去长尾）；一旦筛选则搜全部（含单件馆，可被找到）
    let list = q ? museumAgg.filter(a => ((a.name||"") + " " + (a.en||"")).toLowerCase().includes(q)) : museumAgg.filter(a => a.n >= 2);
    if(idxSort === "name") list = list.slice().sort((a,b) => ((lang==="en"?a.en:a.name)||"").localeCompare((lang==="en"?b.en:b.name)||"", "zh"));
    const frag = document.createDocumentFragment();
    list.forEach(a => {
      const card = document.createElement("div");
      card.className = "artist-card"; card.tabIndex = 0;
      const nm = (lang === "en" ? a.en : a.name) || a.name;
      card.setAttribute("role","button"); card.setAttribute("aria-label", nm);
      const open = () => selectMuseum(a.name);
      card.onclick = open;
      card.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } };
      const thumb = (a.rep && a.rep.thumb)
        ? `<img loading="lazy" decoding="async" src="${imgURL(a.rep.thumb)}" alt="">`
        : `<div class="artist-noimg">🏛</div>`;
      card.innerHTML = `<div class="artist-thumb">${thumb}</div>`+
        `<div class="artist-meta"><div class="artist-name">${esc(nm)}</div>`+
        `<div class="artist-count">${a.n} ${esc(plu(a.n, "works"))}</div></div>`;
      frag.appendChild(card);
    });
    artistIndex.innerHTML = ""; artistIndex.appendChild(frag);
    $("artist-filter-count").textContent = q ? `${list.length} / ${museumAgg.length}` : "";
    if(museumIndexOn){ $("shown-count").textContent = list.length; $("t-works").textContent = plu(list.length, "museums"); }  // 计的是博物馆数
  }
  function showMuseumIndex(){
    clearMuseum(); exitArtist();          // 与艺术家视图互斥（exitArtist 会走 applyFilters，随后覆盖）
    museumIndexOn = true; artistIndexOn = false; artistFilter = null;
    artistIdxFilter = ""; { const fi = $("artist-filter"); if(fi){ fi.value = ""; fi.placeholder = T("filter_museum"); } }
    $("artist-index-bar").style.display = "flex";
    renderMuseumIndex();
    artistIndex.style.display = "grid";
    artistBar.style.display = "none"; $("artist-header").style.display = "none";
    gallery.style.display = "none"; pagination.innerHTML = ""; noResults.style.display = "none";
    eraTabs.style.display = "none"; timelineBar.classList.remove("show");
    $("artist-btn").classList.remove("active"); $("museum-btn").classList.add("active");
    syncURL();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function exitMuseumIndex(){
    museumIndexOn = false;
    artistIndex.style.display = "none"; $("artist-index-bar").style.display = "none";
    $("museum-btn").classList.remove("active");
    const fi = $("artist-filter"); if(fi) fi.placeholder = T("filter_artist");
    gallery.style.display = ""; eraTabs.style.display = "";
    timelineBar.classList.toggle("show", timelineMode);
    applyFilters();
  }

  // —— 筛选 ——
  function applyFilters(){
    if(artistIndexOn || museumIndexOn) return;   // 索引视图有专用筛选框，主搜索/下拉不应改动隐藏的画廊或计数
    const q = searchInput.value.trim().toLowerCase();
    const fe = eraFilter.value, fm = mediumFilter.value, fc = countryFilter.value;
    filtered = DATA.filter(d => {
      if(artistFilter && (d.artist_en || d.artist) !== artistFilter) return false;
      if(museumFilter && d.location !== museumFilter) return false;
      if(favOnly && !favs.has(d.id)) return false;
      if(fe && d.era !== fe) return false;
      if(fm && d.medium !== fm) return false;
      if(fc && d.country !== fc) return false;
      if(periodFilter && periodKey(d.sy) !== periodFilter) return false;
      if(q){
        const hay = (d.title+" "+d.artist+" "+d.year+" "+d.era+" "+d.medium+" "+d.location+" "+(d.country||"")+" "+
          (d.title_en||"")+" "+(d.artist_en||"")+" "+(d.era_en||"")+" "+(d.location_en||"")+" "+(d.country_en||"")+" "+(d.medium_en||"")+" "+(d.py||"")).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
    if(timelineMode){ filtered.sort((a,b)=>a.sy-b.sy); }
    else {
      const sf = $("sort-filter").value;
      if(sf==="year_asc" || (artistFilter && sf==="default")) filtered.sort((a,b)=>a.sy-b.sy);  // 艺术家专辑默认按创作年代
      else if(sf==="year_desc") filtered.sort((a,b)=>b.sy-a.sy);
      else if(sf==="title") filtered.sort((a,b)=>F(a,"title").localeCompare(F(b,"title"), lang==="en"?"en":"zh"));
    }
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
    $("t-works").textContent = plu(filtered.length, "works");   // 画廊/专辑视图计的是作品数（索引视图各自改回）
    if(filtered.length === 0){
      gallery.innerHTML=""; pagination.innerHTML="";
      $("t-noresults").textContent = favOnly ? T("fav_empty") : T("no_results");
      noResults.style.display="block";
      announce(favOnly ? T("fav_empty") : T("no_results"));
      return;
    }
    announce(filtered.length + " " + plu(filtered.length, "works"));
    noResults.style.display = "none";
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if(page >= totalPages) page = totalPages - 1;
    const slice = filtered.slice(page*PER_PAGE, page*PER_PAGE + PER_PAGE);
    gallery.className = "gallery" + (listView ? " list-view" : "");
    const frag = document.createDocumentFragment();
    slice.forEach((d, i) => { const c = makeCard(d, i); c.style.animationDelay = Math.min(i, 14) * 0.022 + "s"; frag.appendChild(c); });
    gallery.innerHTML = ""; gallery.appendChild(frag);
    renderPagination(totalPages);
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function makeCard(d, i){
    const card = document.createElement("div");
    card.className = "art-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", F(d,"title") + " · " + F(d,"artist"));
    card.onclick = () => openModal(d);
    card.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openModal(d); } };
    if(HOVER && d.img){ let pf; card.addEventListener("mouseenter", () => { pf = setTimeout(() => prefetchFull(d), 140); }); card.addEventListener("mouseleave", () => clearTimeout(pf)); }
    const imgWrap = document.createElement("div");
    imgWrap.className = "card-img-wrap";
    imgWrap.style.setProperty("--ar", d.ar ? Math.max(0.45, Math.min(2.4, d.ar)) : 1.33);  // 真实宽高比（极端长卷/竖轴做限幅，contain 不裁切）
    if(d.thumb){
      imgWrap.classList.add("loading");
      const img = document.createElement("img");
      const eager = i < 8;   // 首屏首行：eager + 高优先级，其余懒加载
      img.loading = eager ? "eager" : "lazy"; img.decoding="async"; img.alt=F(d,"title");
      if(eager) img.fetchPriority = "high";
      img.src=imgURL(d.thumb);
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
      if(opts.disabled) b.disabled = true; else b.onclick = () => { page=p; render(); syncURL(); };
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
    else if(museumIndexOn) p.set("view", "museums");
    if(museumFilter) p.set("museum", museumFilter);
    const sf = $("sort-filter").value; if(sf && sf !== "default") p.set("sort", sf);
    if(listView) p.set("list", "1");
    if(page > 0) p.set("p", page + 1);
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
    if(p.get("sort")) $("sort-filter").value = p.get("sort");
    if(p.get("list") === "1"){ listView = true; $("view-toggle").textContent = "☰"; }   // 列表视图（page 于 applyFilters 后单独恢复）
  }

  // —— 详情弹窗 ——
  let modalEntry = null, modalIndex = -1, lastFocus = null;
  let lbLastFocus = null, helpLastFocus = null, aboutLastFocus = null;   // 各对话框关闭后归还焦点
  let _nbrPreload = [], _nbrTimer = 0;
  function openModal(d){
    if(!modalOpen()) lastFocus = document.activeElement;   // 记住触发元素以便归还焦点
    modalEntry = d; modalIndex = filtered.indexOf(d);
    fillModal(d);
    $("modal").classList.add("open");
    document.body.style.overflow = "hidden";
    syncURL();
    setTimeout(() => { try{ $("modal-close").focus(); }catch(e){} }, 30);
  }
  // 让非原生按钮元素也能键盘操作（Enter/Space）；handler 为 null 时撤销交互与语义
  function setActivation(el, handler){
    if(handler){
      el.tabIndex = 0; el.setAttribute("role", "button"); el.onclick = handler;
      el.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); handler(); } };
    } else {
      el.removeAttribute("tabindex"); el.removeAttribute("role"); el.onclick = null; el.onkeydown = null;
    }
  }
  // 弹窗元数据（时代/媒材/国家）可点击 → 跳转到该维度的全部作品
  function metaClick(el, value, kind){
    const on = !!value;
    el.classList.toggle("meta-link", on);
    setActivation(el, on ? () => pivotFilter(kind, value) : null);
  }
  function pivotFilter(kind, value){
    closeModal();
    clearMuseum();
    artistFilter = null; artistIndexOn = false; museumIndexOn = false;
    artistIndex.style.display = "none"; $("artist-index-bar").style.display = "none";
    artistBar.style.display = "none"; $("artist-header").style.display = "none";
    $("artist-btn").classList.remove("active"); $("museum-btn").classList.remove("active");
    gallery.style.display = ""; eraTabs.style.display = "";
    searchInput.value = ""; eraFilter.value = ""; mediumFilter.value = ""; countryFilter.value = ""; periodFilter = null;
    favOnly = false; $("fav-only-btn").classList.remove("active");   // 「查看该维度全部作品」不应被收藏筛选约束
    (kind === "era" ? eraFilter : kind === "medium" ? mediumFilter : countryFilter).value = value;
    buildTimelineBar();
    applyFilters();
  }
  function fillModal(d){
    modalEntry = d;
    const img=$("modal-img"), ph=$("modal-placeholder"), badge=$("zoom-badge");
    const wrap=$("modal-img-wrap");
    if(d.img){
      img.style.display="block";
      img.style.backgroundImage = d.thumb ? `url("${imgURL(d.thumb)}")` : "none";  // 缩略图秒显垫底(LQIP)，大图加载完覆盖
      img.fetchPriority = "high";                                                    // 优先拉当前大图
      img.src=imgURL(d.img); img.alt=F(d,"title");
      ph.classList.remove("show"); badge.style.display="flex"; wrap.style.cursor="zoom-in";
      img.onerror = () => { img.style.backgroundImage="none"; img.style.display="none"; badge.style.display="none"; wrap.style.cursor="default"; showModalPlaceholder(d); };
    } else {
      img.style.backgroundImage="none"; img.style.display="none"; badge.style.display="none"; wrap.style.cursor="default"; showModalPlaceholder(d);
    }
    const eraEl=$("modal-era"); eraEl.textContent=F(d,"era"); metaClick(eraEl, d.era, "era");
    $("modal-title").textContent=F(d,"title");
    $("modal-artist").textContent=F(d,"artist");
    $("modal-year").textContent=F(d,"year");
    const medEl=$("modal-medium"); medEl.textContent=F(d,"medium"); metaClick(medEl, d.medium, "medium");
    const locEl = $("modal-location");
    locEl.textContent = F(d,"location");
    const clickable = d.location && d.location !== "未知收藏" && museumFilter !== d.location;
    locEl.classList.toggle("loc-link", !!clickable);
    setActivation(locEl, clickable ? () => { closeModal(); selectMuseum(d.location); } : null);
    const ctyEl=$("modal-country"); ctyEl.textContent=F(d,"country"); metaClick(ctyEl, (d.country && d.country!=="未知") ? d.country : null, "country");
    fillDesc(d);
    fillCredit(d);
    fillRelated(d);
    $("modal-num").textContent = lang==="zh" ? `第 ${d.id} / ${TOTAL} ${T("of_total")}` : `${d.id} / ${TOTAL}`;
    const mf = $("modal-fav");
    mf.classList.toggle("on", isFav(d.id));
    mf.innerHTML = (isFav(d.id) ? "♥ " : "♡ ") + T(isFav(d.id) ? "fav_on" : "fav");
    const al = $("modal-artist-link");
    const akey = d.artist_en || d.artist;
    if(artistFilter === akey){ al.style.display = "none"; }
    else { al.style.display = ""; al.textContent = T("more_by"); }
    fillArtistAvatar(d, akey);
    scheduleNeighborPreload();
  }
  // 弹窗艺术家小头像（肖像懒加载到达后填充；点击跳该艺术家）
  function fillArtistAvatar(d, akey){
    const av = $("modal-artist-avatar");
    const setP = () => {
      const p = artistPortrait(akey);
      if(p){ av.src = p; av.style.display = ""; av.title = F(d, "artist"); av.onclick = () => { closeModal(); selectArtist(akey); }; }
      else { av.style.display = "none"; av.removeAttribute("src"); av.onclick = null; }
    };
    setP();
    if(!_metaLoaded) loadMeta().then(() => { if(modalEntry === d) setP(); });
  }
  // 元数据（desc/credits/artists）不进首屏关键路径，首次开弹窗或进艺术家视图时懒加载并缓存
  let DESC = window.ART_DESC || null;
  let _metaLoaded = !!(window.ART_DESC && window.ART_CREDITS && window.ART_ARTISTS), _metaLoading = null;
  function _loadScript(src){ return new Promise(res => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s); }); }
  function loadMeta(){
    if(_metaLoaded) return Promise.resolve();
    if(_metaLoading) return _metaLoading;
    _metaLoading = Promise.all([
      window.ART_DESC ? null : _loadScript("desc.js"),
      window.ART_CREDITS ? null : _loadScript("credits.js"),
      window.ART_ARTISTS ? null : _loadScript("artists.js")
    ]).then(() => { DESC = window.ART_DESC || {}; CREDITS = window.ART_CREDITS || {}; ARTISTS = window.ART_ARTISTS || {}; _metaLoaded = true; });
    return _metaLoading;
  }
  function pickDesc(d){ const e = DESC && DESC[d.id]; return e ? (lang === "en" ? (e[1] || e[0]) : (e[0] || e[1])) : ""; }
  function fillDesc(d){
    const el = $("modal-desc");
    if(_metaLoaded){ el.textContent = pickDesc(d); return; }
    el.textContent = "";
    loadMeta().then(() => { if(modalEntry === d) el.textContent = pickDesc(d); });
  }

  // 许可名归一（「public domain」→ 本地化标签），弹窗署名与灯箱题注共用，避免逻辑分叉
  function licLabel(l){ return l ? (/public domain/i.test(l) ? T("credit_pd") : l) : null; }
  function fillCredit(d){
    const mc = $("modal-credit");
    if(!_metaLoaded) loadMeta().then(() => { if(modalEntry === d) fillCredit(d); });  // credits.js 到达后补署名
    const cr = (d.img && d.file) ? CREDITS[d.id] : null;
    if(!cr){ mc.style.display = "none"; mc.innerHTML = ""; return; }
    const src = "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(d.file);
    const parts = [];
    if(cr.a) parts.push(esc(cr.a));
    if(cr.l){
      const licName = licLabel(cr.l);
      const safeLu = cr.lu && /^https?:/i.test(cr.lu);   // 仅 http(s) 才作链接，挡住 javascript:/data: 等注入
      parts.push(safeLu ? `<a href="${esc(cr.lu)}" target="_blank" rel="noopener">${esc(licName)}</a>` : esc(licName));
    }
    parts.push(`<a href="${esc(src)}" target="_blank" rel="noopener">Wikimedia Commons ↗</a>`);
    mc.innerHTML = `<span class="mc-label">${esc(T("credit_img"))}：</span>` + parts.join(" · ");
    mc.style.display = "";
  }
  // 弹窗底部：同一艺术家的其他作品缩略图条
  function fillRelated(d){
    const box = $("modal-related");
    const key = d.artist_en || d.artist;
    const agg = artistByKey.get(key);                                     // 查表，免每次全量 DATA 扫描
    const others = agg ? agg.works.filter(x => x.id !== d.id && x.thumb) : [];
    if(!others.length){ box.style.display = "none"; box.innerHTML = ""; return; }
    const pick = others.slice(0, 10);
    box.style.display = "";
    box.innerHTML = `<div class="mr-label">${esc(T("related_by"))}</div>` +
      `<div class="mr-strip">` + pick.map(x =>
        `<img class="mr-thumb" tabindex="0" role="button" loading="lazy" decoding="async" src="${imgURL(x.thumb)}" alt="${esc(F(x,"title"))}" aria-label="${esc(F(x,"title"))}" title="${esc(F(x,"title") + " · " + F(x,"year"))}" data-id="${x.id}">`
      ).join("") + `</div>`;
    box.querySelectorAll(".mr-thumb").forEach(im => {
      const open = () => { const w = DATA.find(y => y.id === +im.dataset.id); if(w) openModal(w); };
      im.onclick = open;
      im.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };
    });
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
  // 焦点陷阱：Tab 在对话框内循环（弹窗/灯箱/帮助/关于共用）
  function trapTab(e, root){
    const f = [...root.querySelectorAll('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null && !el.disabled);
    if(!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  function navModal(dir){
    if(filtered.length===0) return;
    if(modalIndex < 0){ const j = filtered.indexOf(modalEntry); modalIndex = j >= 0 ? j : (dir > 0 ? -1 : 0); }  // 相关作品可能不在当前筛选列表
    modalIndex=(modalIndex+dir+filtered.length)%filtered.length;
    modalEntry=filtered[modalIndex];
    fillModal(modalEntry);
    syncURL();
  }
  // 预加载相邻作品大图：连续翻页时秒开（延后 250ms 不与当前图抢带宽；
  // 保留 Image 引用防止被 GC 中断下载）
  function scheduleNeighborPreload(){ clearTimeout(_nbrTimer); _nbrTimer = setTimeout(preloadNeighbors, 250); }
  function preloadNeighbors(){
    if(modalIndex < 0 || !filtered.length) return;
    const imgs = [];
    for(const dir of [1, -1]){
      const n = filtered[(modalIndex + dir + filtered.length) % filtered.length];
      if(n && n.img){ const im = new Image(); im.decoding = "async"; im.src = imgURL(n.img); imgs.push(im); }
    }
    _nbrPreload = imgs;
  }
  // 桌面端 hover 预取大图：悬停 140ms 即后台拉取，点开秒显（去重 + 持有引用防 GC）
  const HOVER = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);
  const _pfDone = new Set(), _pfHold = [];
  function prefetchFull(d){
    if(!d || !d.img || _pfDone.has(d.id)) return;
    _pfDone.add(d.id);
    const im = new Image(); im.decoding = "async";
    im.onload = im.onerror = () => { const k = _pfHold.indexOf(im); if(k >= 0) _pfHold.splice(k, 1); };
    im.src = imgURL(d.img);
    _pfHold.push(im);
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
    lbLastFocus = document.activeElement;
    lbReset();
    lbSpinner.classList.add("show");
    lbImg.onload=()=>lbSpinner.classList.remove("show");
    lbImg.onerror=()=>lbSpinner.classList.remove("show");
    lbImg.src=imgURL(d.img); lbImg.alt=F(d,"title");
    let cap = F(d,"title")+" · "+F(d,"artist");
    const cr = CREDITS[d.id];
    if(cr && (cr.a || cr.l)){
      const lic = licLabel(cr.l);
      cap += "　·　" + T("credit_img") + ": " + [cr.a, lic].filter(Boolean).join(" / ");
    }
    $("lb-caption").textContent = cap;
    const orig = originalURL(d.file);
    const ol = $("lb-original");
    if(orig){ ol.href = orig; ol.style.display=""; } else { ol.style.display="none"; }
    lb.classList.add("open");
    setTimeout(() => { try{ $("lb-close").focus(); }catch(e){} }, 30);   // 焦点移入灯箱
    const hint=$("lb-hint"); hint.classList.remove("fade");
    clearTimeout(hintTimer); hintTimer=setTimeout(()=>hint.classList.add("fade"), 2600);
  }
  function closeLightbox(){ lb.classList.remove("open"); lbReset(); try{ lbLastFocus && lbLastFocus.focus(); }catch(e){} }

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
  // applyLangChrome：更新所有文案/占位/无障碍标签/下拉/时间线条（不渲染视图）
  function applyLangChrome(){
    document.documentElement.lang = (lang==="en") ? "en" : "zh-CN";
    $("lang-toggle").textContent = T("lang_btn");
    $("t-sub").textContent = T("title_sub");
    $("t-subtitle").textContent = T("subtitle");
    $("t-works").textContent = T("works");
    $("t-eras").textContent = T("eras");
    $("t-artists").textContent = T("artists");
    searchInput.placeholder = T("search_ph2");
    rebuildSelects();
    $("timeline-btn").textContent = timelineMode ? T("timeline_off") : T("timeline");
    $("fav-only-btn").innerHTML = "♥ " + T("fav_only");
    $("artist-btn").textContent = T("by_artist");
    $("museum-btn").textContent = T("by_museum");
    $("idx-sort").textContent = T(idxSort === "count" ? "sort_by_count" : "sort_by_name");
    { const fi = $("artist-filter"); if(fi) fi.placeholder = museumIndexOn ? T("filter_museum") : T("filter_artist"); }
    $("daily-btn").textContent = T("daily");
    const so = $("sort-filter").options;
    so[0].textContent = T("sort_default"); so[1].textContent = T("sort_year_asc");
    so[2].textContent = T("sort_year_desc"); so[3].textContent = T("sort_title");
    $("help-title").textContent = T("kbd");
    $("kbd-search").textContent = T("kbd_search"); $("kbd-random").textContent = T("kbd_random");
    $("kbd-artist").textContent = T("kbd_artist"); $("kbd-timeline").textContent = T("kbd_timeline");
    $("kbd-fav").textContent = T("kbd_fav"); $("kbd-nav").textContent = T("kbd_nav");
    $("kbd-close").textContent = T("kbd_close"); $("kbd-help").textContent = T("kbd_help");
    $("about-btn").textContent = T("about");
    $("about-title").textContent = T("about_title");
    $("about-intro").textContent = T("about_intro");
    $("about-sources").textContent = T("about_sources");
    $("about-tech").textContent = T("about_tech");
    $("about-credits").textContent = T("about_credits");
    $("about-github").textContent = T("about_github");
    if($("about-overlay").classList.contains("open")) updateAboutStats();   // 惰性：仅面板打开时才做两趟全量统计
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
    // 提示文字 / 无障碍标签随语言更新（此前恒为中文）
    $("clear-search").title = T("clear");
    $("view-toggle").title = T("view_grid");
    $("help-btn").title = T("kbd"); $("help-btn").setAttribute("aria-label", T("kbd"));
    $("zoom-badge").title = T("zoom_in");
    $("lb-zoomout").title = T("zoom_out"); $("lb-zoomin").title = T("zoom_in"); $("lb-reset").title = T("reset_zoom"); $("lb-close").title = T("close");
    $("to-top").title = T("to_top"); $("to-top").setAttribute("aria-label", T("to_top"));
    searchInput.setAttribute("aria-label", T("search_ph2"));
    $("era-filter").setAttribute("aria-label", T("all_eras"));
    $("medium-filter").setAttribute("aria-label", T("all_media"));
    $("country-filter").setAttribute("aria-label", T("all_regions"));
    $("sort-filter").setAttribute("aria-label", T("sort_label"));
    { const fi = $("artist-filter"); if(fi) fi.setAttribute("aria-label", museumIndexOn ? T("filter_museum") : T("filter_artist")); }
    $("modal").setAttribute("aria-label", T("dlg_art"));
    $("modal-close").setAttribute("aria-label", T("close"));
    $("lightbox").setAttribute("aria-label", T("dlg_lightbox"));
    $("help-overlay").setAttribute("aria-label", T("dlg_help"));
    $("about-overlay").setAttribute("aria-label", T("about_title"));
    buildTimelineBar();
  }
  // 依当前视图渲染（buildTabs + 视图分发）；仅纯画廊走 render()，避免隐藏容器空转与重复渲染
  function renderCurrentView(){
    buildTabs();
    if(artistIndexOn) renderArtistIndex();
    else if(museumIndexOn) renderMuseumIndex();
    else if(artistFilter) selectArtist(artistFilter);
    else if(museumFilter) selectMuseum(museumFilter);
    else render();
    if($("modal").classList.contains("open") && modalEntry) fillModal(modalEntry);
  }
  function applyLang(){ applyLangChrome(); renderCurrentView(); }
  $("lang-toggle").onclick = () => {
    lang = (lang==="en") ? "zh" : "en";
    try{ localStorage.setItem("art1001_lang", lang); }catch(e){}   // 写失败也要继续切换（Safari 隐私模式 setItem 抛错）
    applyLang();
  };

  // —— 事件 ——
  let searchTimer;
  searchInput.addEventListener("input", ()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(applyFilters,180); });
  $("clear-search").onclick=()=>{ searchInput.value=""; applyFilters(); searchInput.focus(); };
  $("artist-filter").addEventListener("input", ()=>{ artistIdxFilter = $("artist-filter").value.trim().toLowerCase(); if(museumIndexOn) renderMuseumIndex(); else renderArtistIndex(); });
  $("museum-btn").onclick=()=>{ if(museumIndexOn) exitMuseumIndex(); else showMuseumIndex(); };
  $("idx-sort").onclick=()=>{ idxSort = idxSort === "count" ? "name" : "count"; $("idx-sort").textContent = T(idxSort === "count" ? "sort_by_count" : "sort_by_name"); if(museumIndexOn) renderMuseumIndex(); else renderArtistIndex(); };
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
    const url=location.href;
    try{ await navigator.clipboard.writeText(url); }
    catch(e){ announce(T("share")); try{ window.prompt(T("share"), url); }catch(_){} return; }   // 剪贴板不可用时回退可手动复制
    const b=$("modal-share"); const old=b.innerHTML; b.innerHTML="✓"; b.classList.add("done");
    announce(T("shared"));
    setTimeout(()=>{ b.innerHTML=old; b.classList.remove("done"); }, 1400);
  };
  $("random-btn").onclick=()=>{ if(filtered.length) openModal(filtered[Math.floor(Math.random()*filtered.length)]); else announce(favOnly ? T("fav_empty") : T("no_results")); };
  $("view-toggle").onclick=(e)=>{ listView=!listView; e.target.textContent=listView?"☰":"⊞"; render(); syncURL(); };
  $("sort-filter").onchange=applyFilters;
  // —— 每日一作（按日期确定，每天稳定）——
  function dailyArtwork(){
    const withImg = DATA.filter(d=>d.img);
    if(!withImg.length) return;
    const day = Math.floor(Date.now()/86400000);
    const idx = ((day*2654435761) % withImg.length + withImg.length) % withImg.length;
    openModal(withImg[idx]);
  }
  $("daily-btn").onclick=dailyArtwork;
  // —— 快捷键帮助 ——
  function openHelp(){ helpLastFocus=document.activeElement; $("help-overlay").classList.add("open"); setTimeout(()=>{ try{ $("help-close").focus(); }catch(e){} }, 30); }
  function closeHelp(){ $("help-overlay").classList.remove("open"); try{ helpLastFocus && helpLastFocus.focus(); }catch(e){} }
  $("help-btn").onclick=openHelp;
  $("help-close").onclick=closeHelp;
  $("help-overlay").addEventListener("click", e=>{ if(e.target===$("help-overlay")) closeHelp(); });
  // —— 关于本站 ——
  function updateAboutStats(){
    const nImg = DATA.filter(d=>d.img).length, nArt = uniq("artist").length;
    $("about-stats").innerHTML =
      `<span><strong>${TOTAL}</strong> ${esc(T("about_works"))}</span>`+
      `<span><strong>${nArt}</strong> ${esc(T("about_artists"))}</span>`+
      `<span><strong>${nImg}</strong> ${esc(T("about_images"))}</span>`;
  }
  function openAbout(){ updateAboutStats(); aboutLastFocus=document.activeElement; $("about-overlay").classList.add("open"); setTimeout(()=>{ try{ $("about-close").focus(); }catch(e){} }, 30); }
  function closeAbout(){ $("about-overlay").classList.remove("open"); try{ aboutLastFocus && aboutLastFocus.focus(); }catch(e){} }
  $("about-btn").onclick=openAbout;
  $("about-close").onclick=closeAbout;
  $("about-overlay").addEventListener("click", e=>{ if(e.target===$("about-overlay")) closeAbout(); });
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
      else if(e.key==="Tab") trapTab(e, lb);
      return;
    }
    if(!$("modal").classList.contains("open")) return;
    if(e.key==="Escape") closeModal();
    else if(e.key==="ArrowLeft") navModal(-1);
    else if(e.key==="ArrowRight") navModal(1);
    else if(e.key==="Tab") trapTab(e, $("modal"));
  });
  // —— 全局快捷键 ——
  document.addEventListener("keydown", e=>{
    if($("about-overlay").classList.contains("open")){ if(e.key==="Escape") closeAbout(); else if(e.key==="Tab") trapTab(e, $("about-overlay")); return; }
    if($("help-overlay").classList.contains("open")){ if(e.key==="Escape"||e.key==="?") closeHelp(); else if(e.key==="Tab") trapTab(e, $("help-overlay")); return; }
    if(lb.classList.contains("open") || modalOpen()) return;   // 弹窗/灯箱有各自键盘处理
    if(e.key==="?"){ e.preventDefault(); openHelp(); return; }
    const tag=(e.target.tagName||"").toLowerCase();
    if(tag==="input"||tag==="select"||tag==="textarea"){ if(e.key==="Escape") e.target.blur(); return; }
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    if(e.key==="/"){ e.preventDefault(); searchInput.focus(); }
    else if(e.key==="r"||e.key==="R"){ $("random-btn").click(); }
    else if(e.key==="a"||e.key==="A"){ $("artist-btn").click(); }
    else if(e.key==="t"||e.key==="T"){ $("timeline-btn").click(); }
    else if(e.key==="f"||e.key==="F"){ $("fav-only-btn").click(); }
  });

  $("reset-btn").onclick = () => window.resetFilters();
  window.resetFilters = function(){
    searchInput.value=""; eraFilter.value=""; mediumFilter.value=""; countryFilter.value=""; $("sort-filter").value="default";
    periodFilter=null; favOnly=false; $("fav-only-btn").classList.remove("active");
    if(timelineMode){ timelineMode=false; timelineBar.classList.remove("show"); const tb=$("timeline-btn"); tb.classList.remove("active"); tb.textContent=T("timeline"); }
    artistFilter=null; artistIndexOn=false; museumIndexOn=false; clearMuseum();
    artistIndex.style.display="none"; $("artist-index-bar").style.display="none"; artistBar.style.display="none";
    gallery.style.display=""; eraTabs.style.display=""; $("artist-btn").classList.remove("active"); $("museum-btn").classList.remove("active");
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
    else if(!_restLoaded){ _pendingWantId = id; loadRest(reinitAfterRest); }   // 深链指向尚未合并的其余分片 → 载入后再开
  }
  window.addEventListener("hashchange", openFromHash);

  // —— 按需分片：其余数据流式加载 ——
  let _restLoaded = false, _restLoading = null, _pendingWantId = null;
  function loadRest(cb){
    if(_restLoaded){ cb && cb(); return; }
    if(_restLoading){ if(cb) _restLoading.then(cb); return; }
    _restLoading = new Promise(res => {
      const merge = () => {
        if(window.ART_DATA_REST && window.ART_DATA_REST.length){ for(const d of window.ART_DATA_REST) DATA.push(d); window.ART_DATA_REST = null; }
        _restLoaded = true; res();
      };
      const s = document.createElement("script"); s.src = "data-rest.js";
      s.onload = merge; s.onerror = () => { _restLoaded = true; res(); };   // 失败也放行，核心集仍可用
      document.head.appendChild(s);
    });
    if(cb) _restLoading.then(cb);
  }
  function reinitAfterRest(){
    computeDerived();      // 重算派生结构 + 头部统计
    applyLangChrome();     // 重建下拉/标签/时间线（不渲染视图，避免二次渲染）
    if(artistIndexOn) renderArtistIndex();       // 索引视图各自以全量数据重渲染
    else if(museumIndexOn) renderMuseumIndex();
    else applyFilters();   // 以全量数据重建 filtered 并渲染一次（分页/计数更新）
    if(_pendingWantId != null){ const d = DATA.find(x => x.id === _pendingWantId); _pendingWantId = null; if(d) openModal(d); }
  }

  // —— 启动 ——
  function initApp(){
    computeDerived();     // 构建全部 DATA 派生结构（TRMAP/下拉值/计数/artistAgg/TOTAL/统计）
    applyLang();          // 构建下拉/标签/时间线，首次渲染
    restoreFromURL();     // 从 URL 恢复筛选状态
    buildTimelineBar();   // 反映恢复后的 period 高亮
    const wantId = (location.hash.match(/^#art-(\d+)$/) || [])[1];  // 先抓取深链 id（applyFilters 的 syncURL 会清掉 hash）
    const _ap = new URLSearchParams(location.search);              // 必须在 applyFilters(→syncURL) 清掉查询串之前抓取
    applyFilters();       // 应用已恢复的筛选
    if(_ap.get("artist")) selectArtist(_ap.get("artist"));      // 恢复艺术家作品页
    else if(_ap.get("view") === "artists") showArtistIndex();   // 恢复艺术家索引
    else if(_ap.get("view") === "museums") showMuseumIndex();   // 恢复馆藏索引
    else if(_ap.get("museum")) selectMuseum(_ap.get("museum")); // 恢复馆藏展
    const _pg = parseInt(_ap.get("p"), 10);                     // 恢复分页（须在 applyFilters/选视图把 page 归零之后）
    if(_pg > 1 && !artistIndexOn && !museumIndexOn){ page = _pg - 1; render(); }
    if(wantId){ const d = DATA.find(x => x.id === +wantId); if(d) openModal(d); else _pendingWantId = +wantId; }
  }
  // 带参/深链的 URL 需全量数据才正确 → 先加载其余再初始化；纯首页 → 核心集先渲染，其余随后流式合并
  const _needFull = location.search.length > 1 || /^#art-\d+$/.test(location.hash);
  if(_needFull){ loadRest(initApp); }
  else { initApp(); setTimeout(() => loadRest(reinitAfterRest), 0); }
})();
