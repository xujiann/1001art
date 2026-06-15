/* 1001件人类艺术瑰宝 — 交互逻辑（双语 / 高清灯箱 / 时间线索引） */
(function(){
  "use strict";
  const DATA = window.ART_DATA || [];
  const LANG = window.LANG || {ui:{zh:{},en:{}},dict:{}};
  const PER_PAGE = 48;

  // —— 语言状态 ——
  let lang = (localStorage.getItem("art1001_lang") === "en") ? "en" : "zh";
  const T = k => (LANG.ui[lang] && LANG.ui[lang][k]) || (LANG.ui.zh[k] || k);
  // 取条目的当前语言字段
  const F = (d, base) => (lang === "en" && d[base + "_en"]) ? d[base + "_en"] : d[base];
  // 字段翻译（下拉用：value 始终为中文，label 随语言）
  function tr(kind, zh){ return (lang === "en" && LANG.dict[kind] && LANG.dict[kind][zh]) ? LANG.dict[kind][zh] : zh; }

  // —— 时代 → 占位主题类 ——
  const ERA_THEME = {
    "古埃及":"era-egypt","古希腊":"era-greece","古罗马":"era-rome","拜占庭":"era-byzantine",
    "文艺复兴":"era-renaissance","北方文艺复兴":"era-renaissance","风格主义":"era-renaissance",
    "巴洛克":"era-baroque","洛可可":"era-rococo","古典主义":"era-neoclassic","新古典主义":"era-neoclassic",
    "浪漫主义":"era-romantic","现实主义":"era-realism","拉斐尔前派":"era-romantic","印象派":"era-impressionism",
    "后印象派":"era-impressionism","象征主义":"era-gothic","表现主义":"era-modern","野兽派":"era-modern",
    "立体主义":"era-modern","抽象艺术":"era-modern","至上主义":"era-modern","风格派":"era-modern",
    "包豪斯":"era-modern","达达主义":"era-modern","超现实主义":"era-modern","形而上画派":"era-modern",
    "未来主义":"era-modern","抽象表现主义":"era-contemporary","色域绘画":"era-contemporary",
    "波普艺术":"era-contemporary","新达达主义":"era-contemporary","街头艺术":"era-contemporary",
    "美国现实主义":"era-realism","美国现代主义":"era-modern","素朴艺术":"era-impressionism",
    "现代雕塑":"era-modern","中国秦代":"era-ancient","中国宋代":"era-ancient","中国元代":"era-ancient",
    "中国魏晋":"era-ancient","中国五代":"era-ancient","中国唐代":"era-ancient","中国清代":"era-ancient",
    "中国近现代":"era-modern","中国当代":"era-contemporary","中国佛教艺术":"era-ancient",
    "伊斯兰艺术":"era-medieval","莫卧儿建筑":"era-medieval","浮世绘":"era-realism","巡回画派":"era-realism",
  };
  const eraTheme = era => ERA_THEME[era] || "era-default";

  // —— 图片尺寸派生（从 width=500 缩略图推导）——
  const imgBase = url => url ? url.replace(/\?width=\d+$/, "") : null;
  function imgSized(url, w){ const b = imgBase(url); return b ? (w ? b + "?width=" + w : b) : null; }

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

  // —— DOM ——
  const $ = id => document.getElementById(id);
  const gallery = $("gallery"), searchInput = $("search");
  const eraFilter = $("era-filter"), mediumFilter = $("medium-filter"), countryFilter = $("country-filter");
  const eraTabs = $("era-tabs"), timelineBar = $("timeline-bar");
  const pagination = $("pagination"), noResults = $("no-results");

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

  // —— 筛选 ——
  function applyFilters(){
    const q = searchInput.value.trim().toLowerCase();
    const fe = eraFilter.value, fm = mediumFilter.value, fc = countryFilter.value;
    filtered = DATA.filter(d => {
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
    render();
  }

  // —— 渲染 ——
  function render(){
    $("shown-count").textContent = filtered.length;
    if(filtered.length === 0){
      gallery.innerHTML=""; pagination.innerHTML=""; noResults.style.display="block"; return;
    }
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
    card.onclick = () => openModal(d);
    const imgWrap = document.createElement("div");
    imgWrap.className = "card-img-wrap";
    if(d.img){
      const img = document.createElement("img");
      img.loading="lazy"; img.alt=F(d,"title"); img.src=d.img;
      img.onerror = () => { imgWrap.innerHTML = placeholderHTML(d); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = placeholderHTML(d);
    }
    const num = document.createElement("div");
    num.className="card-num"; num.textContent="#"+d.id; imgWrap.appendChild(num);
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
    return `<div class="card-placeholder ${eraTheme(d.era)}">`+
      `<span>❖</span><span class="art-num">${esc(F(d,"title"))}</span></div>`+
      `<div class="card-num">#${d.id}</div>`;
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

  // —— 详情弹窗 ——
  let modalEntry = null, modalIndex = -1;
  function openModal(d){
    modalEntry = d; modalIndex = filtered.indexOf(d);
    fillModal(d);
    $("modal").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function fillModal(d){
    modalEntry = d;
    const img=$("modal-img"), ph=$("modal-placeholder"), badge=$("zoom-badge");
    if(d.img){
      img.style.display="block"; img.src=imgSized(d.img,1280); img.alt=F(d,"title");
      ph.classList.remove("show"); badge.style.display="flex";
      img.onerror = () => { img.style.display="none"; badge.style.display="none"; showModalPlaceholder(d); };
    } else {
      img.style.display="none"; badge.style.display="none"; showModalPlaceholder(d);
    }
    $("modal-era").textContent=F(d,"era");
    $("modal-title").textContent=F(d,"title");
    $("modal-artist").textContent=F(d,"artist");
    $("modal-year").textContent=F(d,"year");
    $("modal-medium").textContent=F(d,"medium");
    $("modal-location").textContent=F(d,"location");
    $("modal-country").textContent=F(d,"country");
    $("modal-desc").textContent=F(d,"desc");
    $("modal-num").textContent = lang==="zh" ? `第 ${d.id} / 1001 ${T("of_total")}` : `${d.id} / 1001`;
  }
  function showModalPlaceholder(d){
    const ph=$("modal-placeholder");
    ph.className="modal-img-placeholder show "+eraTheme(d.era);
    ph.innerHTML=`<span>❖</span><span style="font-size:0.9rem;color:var(--text2)">${esc(F(d,"title"))}</span>`;
  }
  function closeModal(){ $("modal").classList.remove("open"); document.body.style.overflow=""; }
  function navModal(dir){
    if(filtered.length===0) return;
    modalIndex=(modalIndex+dir+filtered.length)%filtered.length;
    fillModal(filtered[modalIndex]);
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
    const big=imgSized(d.img,2500);
    lbImg.onload=()=>lbSpinner.classList.remove("show");
    lbImg.onerror=()=>{ lbSpinner.classList.remove("show"); lbImg.src=imgSized(d.img,1280); };
    lbImg.src=big; lbImg.alt=F(d,"title");
    $("lb-caption").textContent = F(d,"title")+" · "+F(d,"artist");
    $("lb-original").href = imgBase(d.img);
    lb.classList.add("open");
    const hint=$("lb-hint"); hint.classList.remove("fade");
    clearTimeout(hintTimer); hintTimer=setTimeout(()=>hint.classList.add("fade"), 2600);
  }
  function closeLightbox(){ lb.classList.remove("open"); lbReset(); }

  lbStage.addEventListener("wheel", e=>{ e.preventDefault(); lbZoom(e.deltaY<0?1.15:0.87, e.clientX, e.clientY); }, {passive:false});
  lbStage.addEventListener("dblclick", e=>{ lbZoom(scale>1?0.001:2.4, e.clientX, e.clientY); });
  lbStage.addEventListener("pointerdown", e=>{ if(scale<=1) return; dragging=true; lbStage.classList.add("grabbing"); sx=e.clientX; sy=e.clientY; stx=tx; sty=ty; lbStage.setPointerCapture(e.pointerId); });
  lbStage.addEventListener("pointermove", e=>{ if(!dragging) return; tx=stx+(e.clientX-sx); ty=sty+(e.clientY-sy); lbApply(); });
  lbStage.addEventListener("pointerup", e=>{ dragging=false; lbStage.classList.remove("grabbing"); });
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
    $("random-btn").textContent = T("random");
    $("l-date").textContent = T("m_date");
    $("l-medium").textContent = T("m_medium");
    $("l-location").textContent = T("m_location");
    $("l-country").textContent = T("m_country");
    $("prev-art").textContent = T("prev");
    $("next-art").textContent = T("next");
    $("t-original").textContent = T("view_original");
    $("lb-hint").textContent = T("zoom_hint");
    $("t-noresults").textContent = T("no_results");
    $("reset-btn").textContent = T("reset");
    $("t-footer").textContent = T("footer");
    buildTimelineBar();
    buildTabs();
    render();
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
  });
  $("reset-btn").onclick = () => window.resetFilters();
  window.resetFilters = function(){
    searchInput.value=""; eraFilter.value=""; mediumFilter.value=""; countryFilter.value="";
    periodFilter=null; buildTimelineBar(); applyFilters();
  };

  function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // —— 启动 ——
  applyLang();
})();
