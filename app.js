/* 1001件人类艺术瑰宝 — 交互逻辑 */
(function(){
  "use strict";
  const DATA = window.ART_DATA || [];
  const PER_PAGE = 48;

  // 时代 → CSS 占位主题类映射
  const ERA_THEME = {
    "古埃及":"era-egypt","古希腊":"era-greece","古罗马":"era-rome",
    "拜占庭":"era-byzantine","文艺复兴":"era-renaissance","北方文艺复兴":"era-renaissance",
    "风格主义":"era-renaissance","巴洛克":"era-baroque","洛可可":"era-rococo",
    "古典主义":"era-neoclassic","新古典主义":"era-neoclassic","浪漫主义":"era-romantic",
    "现实主义":"era-realism","拉斐尔前派":"era-romantic","印象派":"era-impressionism",
    "后印象派":"era-impressionism","象征主义":"era-gothic","表现主义":"era-modern",
    "野兽派":"era-modern","立体主义":"era-modern","抽象艺术":"era-modern",
    "至上主义":"era-modern","风格派":"era-modern","包豪斯":"era-modern",
    "达达主义":"era-modern","超现实主义":"era-modern","形而上画派":"era-modern",
    "未来主义":"era-modern","抽象表现主义":"era-contemporary","色域绘画":"era-contemporary",
    "波普艺术":"era-contemporary","新达达主义":"era-contemporary","街头艺术":"era-contemporary",
    "美国现实主义":"era-realism","美国现代主义":"era-modern","素朴艺术":"era-impressionism",
    "现代雕塑":"era-modern","中国秦代":"era-ancient","中国宋代":"era-ancient",
    "中国元代":"era-ancient","中国魏晋":"era-ancient","中国五代":"era-ancient",
    "中国唐代":"era-ancient","中国清代":"era-ancient","中国近现代":"era-modern",
    "中国当代":"era-contemporary","中国佛教艺术":"era-ancient","伊斯兰艺术":"era-medieval",
    "莫卧儿建筑":"era-medieval","浮世绘":"era-realism","巡回画派":"era-realism",
  };
  function eraTheme(era){ return ERA_THEME[era] || "era-default"; }

  // 状态
  let filtered = DATA.slice();
  let page = 0;
  let listView = false;

  // DOM
  const $ = id => document.getElementById(id);
  const gallery = $("gallery");
  const searchInput = $("search");
  const eraFilter = $("era-filter");
  const mediumFilter = $("medium-filter");
  const countryFilter = $("country-filter");
  const eraTabs = $("era-tabs");
  const pagination = $("pagination");
  const noResults = $("no-results");

  // —— 初始化筛选下拉 ——
  function uniq(key){
    const s = new Set();
    DATA.forEach(d => { if(d[key]) s.add(d[key]); });
    return [...s].sort((a,b)=>a.localeCompare(b,"zh"));
  }
  function fillSelect(sel, items){
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  const eras = uniq("era");
  fillSelect(eraFilter, eras);
  fillSelect(mediumFilter, uniq("medium"));
  fillSelect(countryFilter, uniq("country"));

  // 统计
  $("era-count").textContent = eras.length;
  $("artist-count").textContent = uniq("artist").length;

  // 时代快捷标签（取作品数最多的前 14 个时代）
  const eraCounts = {};
  DATA.forEach(d => eraCounts[d.era] = (eraCounts[d.era]||0)+1);
  const topEras = Object.keys(eraCounts).sort((a,b)=>eraCounts[b]-eraCounts[a]).slice(0,14);
  function buildTabs(){
    eraTabs.innerHTML = "";
    const all = document.createElement("button");
    all.className = "era-tab active"; all.textContent = "全部";
    all.onclick = () => { eraFilter.value=""; setActiveTab(all); applyFilters(); };
    eraTabs.appendChild(all);
    topEras.forEach(era => {
      const b = document.createElement("button");
      b.className = "era-tab";
      b.textContent = `${era} (${eraCounts[era]})`;
      b.dataset.era = era;
      b.onclick = () => { eraFilter.value = era; setActiveTab(b); applyFilters(); };
      eraTabs.appendChild(b);
    });
  }
  function setActiveTab(active){
    eraTabs.querySelectorAll(".era-tab").forEach(t=>t.classList.remove("active"));
    if(active) active.classList.add("active");
  }
  buildTabs();

  // —— 筛选与搜索 ——
  function applyFilters(){
    const q = searchInput.value.trim().toLowerCase();
    const fe = eraFilter.value, fm = mediumFilter.value, fc = countryFilter.value;
    filtered = DATA.filter(d => {
      if(fe && d.era !== fe) return false;
      if(fm && d.medium !== fm) return false;
      if(fc && d.country !== fc) return false;
      if(q){
        const hay = (d.title+" "+d.artist+" "+d.year+" "+d.era+" "+d.medium+" "+d.location).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
    page = 0;
    // 同步标签高亮
    if(!fe) setActiveTab(eraTabs.querySelector(".era-tab"));
    else {
      const match = [...eraTabs.querySelectorAll(".era-tab")].find(t=>t.dataset.era===fe);
      setActiveTab(match || null);
    }
    render();
  }

  // —— 渲染 ——
  function render(){
    $("shown-count").textContent = filtered.length;
    if(filtered.length === 0){
      gallery.innerHTML = "";
      pagination.innerHTML = "";
      noResults.style.display = "block";
      return;
    }
    noResults.style.display = "none";
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if(page >= totalPages) page = totalPages - 1;
    const start = page * PER_PAGE;
    const slice = filtered.slice(start, start + PER_PAGE);

    gallery.className = "gallery" + (listView ? " list-view" : "");
    const frag = document.createDocumentFragment();
    slice.forEach(d => frag.appendChild(makeCard(d)));
    gallery.innerHTML = "";
    gallery.appendChild(frag);
    renderPagination(totalPages);
    window.scrollTo({top: 0, behavior: "smooth"});
  }

  function makeCard(d){
    const card = document.createElement("div");
    card.className = "art-card";
    card.onclick = () => openModal(d);

    const imgWrap = document.createElement("div");
    imgWrap.className = "card-img-wrap";
    if(d.img){
      const img = document.createElement("img");
      img.loading = "lazy"; img.alt = d.title; img.src = d.img;
      img.onerror = () => { imgWrap.innerHTML = placeholderHTML(d); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = placeholderHTML(d);
    }
    const num = document.createElement("div");
    num.className = "card-num"; num.textContent = "#" + d.id;
    imgWrap.appendChild(num);

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML =
      `<div><div class="card-era">${esc(d.era)}</div>`+
      `<div class="card-title">${esc(d.title)}</div>`+
      `<div class="card-artist">${esc(d.artist)}</div>`+
      `<div class="card-year">${esc(d.year)}</div></div>`;

    card.appendChild(imgWrap);
    card.appendChild(body);
    return card;
  }

  function placeholderHTML(d){
    return `<div class="card-placeholder ${eraTheme(d.era)}">`+
      `<span>❖</span><span class="art-num">${esc(d.title)}</span></div>`+
      `<div class="card-num">#${d.id}</div>`;
  }

  function renderPagination(totalPages){
    pagination.innerHTML = "";
    if(totalPages <= 1) return;
    const mk = (label, p, opts={}) => {
      const b = document.createElement("button");
      b.className = "page-btn" + (opts.active ? " active" : "");
      b.textContent = label;
      if(opts.disabled) b.disabled = true;
      else b.onclick = () => { page = p; render(); };
      return b;
    };
    pagination.appendChild(mk("‹", page-1, {disabled: page===0}));
    const win = [];
    const add = p => { if(p>=0 && p<totalPages && !win.includes(p)) win.push(p); };
    add(0); add(1);
    for(let p=page-1; p<=page+1; p++) add(p);
    add(totalPages-2); add(totalPages-1);
    win.sort((a,b)=>a-b);
    let last = -1;
    win.forEach(p => {
      if(p - last > 1){
        const dots = document.createElement("span");
        dots.textContent = "…"; dots.style.cssText="color:var(--text3);padding:0 4px;align-self:center";
        pagination.appendChild(dots);
      }
      pagination.appendChild(mk(String(p+1), p, {active: p===page}));
      last = p;
    });
    pagination.appendChild(mk("›", page+1, {disabled: page===totalPages-1}));
  }

  // —— 详情弹窗 ——
  let modalIndex = -1;
  function openModal(d){
    modalIndex = filtered.indexOf(d);
    fillModal(d);
    $("modal").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function fillModal(d){
    const img = $("modal-img"), ph = $("modal-placeholder");
    if(d.img){
      img.style.display = "block"; img.src = d.img; img.alt = d.title;
      ph.classList.remove("show");
      img.onerror = () => { img.style.display="none"; showModalPlaceholder(d); };
    } else {
      img.style.display = "none"; showModalPlaceholder(d);
    }
    $("modal-era").textContent = d.era;
    $("modal-title").textContent = d.title;
    $("modal-artist").textContent = d.artist;
    $("modal-year").textContent = d.year;
    $("modal-medium").textContent = d.medium;
    $("modal-location").textContent = d.location;
    $("modal-country").textContent = d.country;
    $("modal-desc").textContent = d.desc;
    $("modal-num").textContent = `第 ${d.id} / 1001 件`;
  }
  function showModalPlaceholder(d){
    const ph = $("modal-placeholder");
    ph.className = "modal-img-placeholder show " + eraTheme(d.era);
    ph.innerHTML = `<span>❖</span><span style="font-size:0.9rem;color:var(--text2)">${esc(d.title)}</span>`;
  }
  function closeModal(){
    $("modal").classList.remove("open");
    document.body.style.overflow = "";
  }
  function navModal(dir){
    if(filtered.length === 0) return;
    modalIndex = (modalIndex + dir + filtered.length) % filtered.length;
    fillModal(filtered[modalIndex]);
  }

  // —— 事件绑定 ——
  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 180);
  });
  $("clear-search").onclick = () => { searchInput.value=""; applyFilters(); searchInput.focus(); };
  eraFilter.onchange = applyFilters;
  mediumFilter.onchange = applyFilters;
  countryFilter.onchange = applyFilters;
  $("random-btn").onclick = () => {
    if(filtered.length === 0) return;
    openModal(filtered[Math.floor(Math.random()*filtered.length)]);
  };
  $("view-toggle").onclick = (e) => {
    listView = !listView;
    e.target.textContent = listView ? "☰" : "⊞";
    render();
  };
  $("modal-close").onclick = closeModal;
  $("prev-art").onclick = () => navModal(-1);
  $("next-art").onclick = () => navModal(1);
  $("modal").addEventListener("click", e => { if(e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", e => {
    if(!$("modal").classList.contains("open")) return;
    if(e.key === "Escape") closeModal();
    else if(e.key === "ArrowLeft") navModal(-1);
    else if(e.key === "ArrowRight") navModal(1);
  });

  // 全局重置（供 no-results 按钮调用）
  window.resetFilters = function(){
    searchInput.value=""; eraFilter.value=""; mediumFilter.value=""; countryFilter.value="";
    setActiveTab(eraTabs.querySelector(".era-tab"));
    applyFilters();
  };

  function esc(s){
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // 启动
  render();
})();
