const API_URL = "https://script.google.com/macros/s/AKfycbzsGDVVv_aBtiO1APPG0gbafuh-vZ6UTkTHduz2fvOYowE9jQdJ8VhOrbrvBdzEjd5j/exec";
const LOCAL_KEY = "powerpool-2026-local-ui-v7";
const PENDING_KEY = "powerpool-2026-pending-saves-v7";
const RECENT_KEY = "powerpool-2026-recent-v7";
const CHANNELS = [
  { key: "trendyol", label: "Trendyol", short: "TY" },
  { key: "hepsiburada", label: "Hepsiburada", short: "HB" },
  { key: "n11", label: "n11", short: "N11" },
  { key: "epool", label: "e-Pool Market", short: "EP" },
  { key: "havuz", label: "Havuz Toptancısı", short: "HT" },
];
const state = {
  main: "TÜM KATEGORİLER",
  sub: "TÜM ALT KATEGORİLER",
  search: "",
  status: "ALL",
  missing: "ALL",
  quick: "all",
  deleted: new Set(),
  marketplaces: {},
  apiReady: false,
  pending: new Map(),
  queueRunning: false,
  retryTimer: null,
  recent: [],
  saveTimer: null,
};
const $ = (id) => document.getElementById(id);
const els = {
  categoryList: $("categoryList"),
  catAll: $("cat-all"),
  catAllSide: $("cat-all-side"),
  sub: $("subCategory"),
  search: $("search"),
  status: $("statusFilter"),
  missing: $("missingFilter"),
  body: $("productBody"),
  empty: $("emptyState"),
  total: $("totalCount"),
  complete: $("completeCount"),
  missingCount: $("missingCount"),
  unchecked: $("uncheckedCount"),
  result: $("resultText"),
  exportCsv: $("exportCsv"),
  channelProgress: $("channelProgress"),
  recent: $("recentChanges"),
};
function normalizeRecord(r) {
  const o = {};
  CHANNELS.forEach((c) => (o[c.key] = r && r[c.key] ? r[c.key] : "?"));
  return o;
}
function loadLocal() {
  try {
    const x = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    state.deleted = new Set(x.deleted || []);
  } catch (_) {
    state.deleted = new Set();
  }
  try {
    state.recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (_) {
    state.recent = [];
  }
  try {
    state.pending = new Map(Object.entries(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}")));
  } catch (_) {
    state.pending = new Map();
  }
}
function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ deleted: [...state.deleted] }));
}
function saveRecent() {
  localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent.slice(0, 30)));
}
function savePending() {
  const x = {};
  state.pending.forEach((v, k) => (x[k] = v));
  if (Object.keys(x).length) localStorage.setItem(PENDING_KEY, JSON.stringify(x));
  else localStorage.removeItem(PENDING_KEY);
}
function applyPending() {
  state.pending.forEach((v, id) => (state.marketplaces[id] = normalizeRecord(v)));
}
function getMarket(id) {
  if (!state.marketplaces[id]) state.marketplaces[id] = normalizeRecord();
  return state.marketplaces[id];
}
function setApiMessage(message) {
  let e = $("apiStatus");
  if (!e) {
    e = document.createElement("div");
    e.id = "apiStatus";
    e.className = "api-toast";
    document.body.appendChild(e);
  }
  e.textContent = message;
  e.className = "api-toast " + (message.startsWith("✓") ? "ok" : message.startsWith("⚠") ? "error" : "info");
  const mini = $("apiMini");
  if (mini) {
    mini.classList.toggle("offline", message.startsWith("⚠"));
  }
}
function jsonpCall(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `ppJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const script = document.createElement("script");

    const payload = {
      action,
      ...params,
      _ts: Date.now(),
      callback: callbackName,
    };

    const query = new URLSearchParams(payload);

    let settled = false;
    let timedOut = false;

    const removeCallback = () => {
      try {
        delete window[callbackName];
      } catch (_) {
        window[callbackName] = undefined;
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      removeCallback();
    };

    const timer = setTimeout(() => {
      if (settled) return;

      timedOut = true;
      settled = true;

      reject(new Error("Google Apps Script zaman aşımı"));
    }, 60000);

    window[callbackName] = (data) => {
      if (timedOut) {
        cleanup();
        return;
      }

      if (settled) return;

      settled = true;
      cleanup();

      if (data && data.success === false) {
        reject(new Error(data.error || "Google API hatası"));
        return;
      }

      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;

      settled = true;
      cleanup();

      reject(new Error("Google Apps Script bağlantısı kurulamadı"));
    };

    script.src = `${API_URL}?${query.toString()}`;

    document.head.appendChild(script);
  });
}

async function apiCall(action, params = {}) {
  return jsonpCall(action, params);
}

async function apiCall(action, params = {}) {
  return jsonpCall(action, params);
}
async function loadGoogle() {
  setApiMessage("Google Sheets bağlantısı kuruluyor…");
  try {
    const d = await apiCall("load");
    state.marketplaces = {};
    Object.entries(d.statuses || {}).forEach(([id, v]) => (state.marketplaces[id] = normalizeRecord(v)));
    applyPending();
    state.apiReady = true;
    setApiMessage(state.pending.size ? `✓ Sheets bağlı · ${state.pending.size} bekleyen` : "✓ Google Sheets bağlı");
    processQueue();
    render();
  } catch (e) {
    state.apiReady = false;
    applyPending();
    setApiMessage("⚠ Google Sheets bağlantısı kurulamadı");
    console.warn(e);
    render();
  }
}
function categories() {
  return [...new Set(PRODUCTS.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
}
function subs(main) {
  const src = main === "TÜM KATEGORİLER" ? PRODUCTS : PRODUCTS.filter((p) => p.category === main);
  return [...new Set(src.map((p) => p.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
}
function fillSelect(el, values, all) {
  el.innerHTML = "";
  el.add(new Option(all, all));
  values.forEach((v) => el.add(new Option(v, v)));
}
function initFilters() {
  fillSelect(els.sub, subs(state.main), "TÜM ALT KATEGORİLER");
  if (![...els.sub.options].some((o) => o.value === state.sub)) state.sub = "TÜM ALT KATEGORİLER";
  els.sub.value = state.sub;
}
function statusOf(p) {
  const v = CHANNELS.map((c) => getMarket(p.id)[c.key]);
  const checked = v.filter((x) => x !== "?").length,
    exists = v.filter((x) => x === "✓").length;
  return { checked, exists, complete: exists === 5, none: checked === 5 && exists === 0, singleMissing: exists === 4 && checked === 5 };
}
function activeProducts() {
  return PRODUCTS.filter((p) => !state.deleted.has(p.id));
}
function filteredProducts() {
  const q = state.search.trim().toLocaleLowerCase("tr-TR");
  return activeProducts().filter((p) => {
    if (state.main !== "TÜM KATEGORİLER" && p.category !== state.main) return false;
    if (state.sub !== "TÜM ALT KATEGORİLER" && p.subcategory !== state.sub) return false;
    if (q && !`${p.name} ${p.code} ${p.category} ${p.subcategory}`.toLocaleLowerCase("tr-TR").includes(q)) return false;
    const s = statusOf(p),
      m = getMarket(p.id);
    if (state.quick === "missing" && (s.complete || s.checked === 0)) return false;
    if (state.quick === "unchecked" && s.checked !== 0) return false;
    if (state.quick === "complete" && !s.complete) return false;
    if (state.quick === "single" && !s.singleMissing) return false;
    if (state.status === "COMPLETE" && !s.complete) return false;
    if (state.status === "MISSING" && (s.complete || s.checked === 0)) return false;
    if (state.status === "UNCHECKED" && s.checked !== 0) return false;
    if (state.status === "NONE" && !s.none) return false;
    if (state.missing !== "ALL" && m[state.missing] !== "×") return false;
    return true;
  });
}
function renderCategories() {
  const a = activeProducts(),
    counts = new Map();
  a.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
  if (els.catAll) els.catAll.textContent = a.length.toLocaleString("tr-TR");
  if (els.catAllSide) els.catAllSide.textContent = a.length.toLocaleString("tr-TR");
  if (!els.categoryList) return;
  const buttons = [...els.categoryList.querySelectorAll(".cat-btn")];
  if (buttons.length === 0) {
    categories().forEach((cat) => {
      const b = document.createElement("button");
      b.className = "cat-btn";
      b.dataset.category = cat;
      b.innerHTML = `<span>${escapeHtml(cat)}</span><b>0</b>`;
      els.categoryList.appendChild(b);
    });
  }
  els.categoryList.querySelectorAll(".cat-btn").forEach((b) => {
    const cat = b.dataset.category;
    b.classList.toggle("active", state.main === cat);
    const count = b.querySelector("b");
    if (count) count.textContent = (counts.get(cat) || 0).toLocaleString("tr-TR");
  });
  document.querySelector('.cat-btn[data-category="TÜM KATEGORİLER"]')?.classList.toggle("active", state.main === "TÜM KATEGORİLER");
}
function renderStats() {
  const a = activeProducts(),
    ss = a.map(statusOf),
    complete = ss.filter((s) => s.complete).length,
    missing = ss.filter((s) => s.checked > 0 && !s.complete).length,
    unchecked = ss.filter((s) => s.checked === 0).length;
  els.total.textContent = a.length.toLocaleString("tr-TR");
  els.complete.textContent = complete.toLocaleString("tr-TR");
  els.missingCount.textContent = missing.toLocaleString("tr-TR");
  els.unchecked.textContent = unchecked.toLocaleString("tr-TR");
  const pct = a.length ? Math.round((complete / a.length) * 100) : 0;
  const ring = document.querySelector(".ring");
  if (ring) ring.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg,var(--line) 0deg)`;
  const op = $("overallProgress");
  if (op) op.textContent = pct + "%";
}
function renderProgress() {
  const a = activeProducts();
  let allYes = 0;
  els.channelProgress.innerHTML = CHANNELS.map((c) => {
    const yes = a.filter((p) => getMarket(p.id)[c.key] === "✓").length;
    allYes += yes;
    const pct = a.length ? Math.round((yes / a.length) * 100) : 0;
    return `<div class="progress-row"><span>${c.label}</span><b>${yes}/${a.length}</b><div><i style="width:${pct}%"></i></div><em>${pct}%</em></div>`;
  }).join("");
}
function renderRecent() {
  if (!els.recent) return;
  if (!state.recent.length) {
    els.recent.innerHTML = '<div class="recent-empty">Henüz değişiklik yok.</div>';
    return;
  }
  els.recent.innerHTML = state.recent
    .slice(0, 8)
    .map(
      (x) =>
        `<div class="recent-item"><span>${escapeHtml(x.time)}</span><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.channel)} ${x.value === "✓" ? '<b class="r-yes">✓</b>' : x.value === "×" ? '<b class="r-no">×</b>' : '<b class="r-q">?</b>'}</span></div>`,
    )
    .join("");
}
function addRecent(p, c, value) {
  state.recent.unshift({
    time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    name: p.name,
    channel: c.label,
    value,
  });
  state.recent = state.recent.slice(0, 30);
  saveRecent();
  renderRecent();
}
function render() {
  try {
    const rows = filteredProducts();
    els.body.innerHTML = "";
    rows.forEach((p) => {
      const m = getMarket(p.id),
        s = statusOf(p),
        tr = document.createElement("tr");
      if (s.complete) tr.classList.add("complete-row");
      else if (s.checked) tr.classList.add("partial-row");
      tr.innerHTML = `<td class="namecell product-col"><div class="product-info"><div class="product-thumb">IMAGE<br>NOT FOUND</div><div class="product-main"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category)} › ${escapeHtml(p.subcategory)}</small></div></div></td><td class="code">${escapeHtml(p.code)}</td>${CHANNELS.map((c) => `<td class="market-cell" data-label="${c.short}"><button class="market-btn ${stateClass(m[c.key])}" title="${c.label}: ${titleState(m[c.key])}" data-market="${c.key}" data-id="${p.id}">${m[c.key]}</button></td>`).join("")}<td class="status-cell"><span class="status-pill ${s.complete ? "ok" : s.checked ? "warn" : "neutral"}">${s.complete ? "✓ TAMAM" : s.checked ? `⚠ ${5 - s.exists} EKSİK` : "? BEKLİYOR"}</span></td><td class="center"><button class="delete-btn" title="Ürünü listeden çıkar" data-delete="${p.id}">⋮</button></td>`;
      els.body.appendChild(tr);
    });
    els.empty.classList.toggle("hidden", rows.length !== 0);
    els.result.textContent = `${rows.length.toLocaleString("tr-TR")} sonuç listeleniyor`;
    renderStats();
    renderProgress();
    renderCategories();
    renderRecent();
    updateQuickChips();
  } catch (e) {
    console.error("Render hatası", e);
    renderCategories();
  }
}
function stateClass(v) {
  return v === "✓" ? "yes" : v === "×" ? "no" : "q";
}
function titleState(v) {
  return v === "✓" ? "Var" : v === "×" ? "Kontrol edildi / Yok" : "Kontrol edilmedi";
}
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
function enqueueSave(id) {
  state.pending.set(id, normalizeRecord(getMarket(id)));
  savePending();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(processQueue, 250);
}
async function processQueue() {
  if (state.queueRunning || !state.apiReady || !state.pending.size) return;
  state.queueRunning = true;
  try {
    while (state.apiReady && state.pending.size) {
      const [id, snapshot] = state.pending.entries().next().value;
      try {
        await apiCall("save", { productId: id, id, ...snapshot });
        if (state.pending.get(id) === snapshot) state.pending.delete(id);
        savePending();
        setApiMessage(state.pending.size ? `✓ Kaydediliyor · ${state.pending.size} kayıt kaldı` : "✓ Google Sheets kaydedildi");
      } catch (e) {
        console.warn("Kayıt hatası", e);
        setApiMessage("⚠ Kayıt bekliyor · tekrar denenecek");
        clearTimeout(state.retryTimer);
        state.retryTimer = setTimeout(processQueue, 4000);
        break;
      }
    }
  } finally {
    state.queueRunning = false;
  }
}
function cycle(id, key) {
  const p = PRODUCTS.find((x) => x.id === id),
    m = getMarket(id),
    c = CHANNELS.find((x) => x.key === key);
  if (!p || !c) return;
  m[key] = m[key] === "?" ? "✓" : m[key] === "✓" ? "×" : "?";
  addRecent(p, c, m[key]);
  enqueueSave(id);
  render();
}
function quickFilter(type) {
  state.quick = type;
  state.status = "ALL";
  state.missing = "ALL";
  if (type === "missing") state.status = "MISSING";
  if (type === "unchecked") state.status = "UNCHECKED";
  if (type === "complete") state.status = "COMPLETE";
  render();
}
function updateQuickChips() {
  document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b.dataset.quick === state.quick));
}
function exportCsv() {
  const rows = filteredProducts(),
    header = ["Kategori", "Alt Kategori", "Ürün", "Kod", ...CHANNELS.map((c) => c.label), "Eksik Kanal", "Durum"];
  const data = [
    header,
    ...rows.map((p) => {
      const m = getMarket(p.id),
        s = statusOf(p),
        missing = CHANNELS.filter((c) => m[c.key] === "×")
          .map((c) => c.label)
          .join(", ");
      return [
        p.category,
        p.subcategory,
        p.name,
        p.code,
        ...CHANNELS.map((c) => titleState(m[c.key])),
        missing,
        s.complete ? "TAMAM" : s.checked ? "EKSİK" : "KONTROL EDİLMEDİ",
      ];
    }),
  ];
  const csv = "\ufeff" + data.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = "powerpool-urunler-kontrol.csv";
  a.click();
}
function openModal(id) {
  $(id)?.classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal(id) {
  $(id)?.classList.add("hidden");
  if (!document.querySelector(".modal:not(.hidden)")) document.body.classList.remove("modal-open");
}
function renderTrash() {
  const ids = [...state.deleted],
    list = $("trashList");
  $("trashCountText").textContent = `${ids.length} ürün`;
  list.innerHTML = ids.length
    ? ids
        .map((id) => {
          const p = PRODUCTS.find((x) => x.id === id);
          return p
            ? `<div class="trash-item"><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.code)} · ${escapeHtml(p.category)}</small></div><button class="mini-btn" data-restore="${id}">Geri Al</button></div>`
            : "";
        })
        .join("")
    : '<div class="recent-empty">Geri dönüşüm kutusu boş.</div>';
}
function deleteProduct(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (p && confirm(`"${p.name}" ürününü listeden çıkarmak istiyor musunuz?`)) {
    state.deleted.add(id);
    saveLocal();
    render();
  }
}
function restoreProduct(id) {
  state.deleted.delete(id);
  saveLocal();
  renderTrash();
  render();
}
$("categoryList").addEventListener("click", (e) => {
  const b = e.target.closest(".cat-btn");
  if (!b) return;
  state.main = b.dataset.category;
  state.sub = "TÜM ALT KATEGORİLER";
  initFilters();
  render();
});
document.querySelector('.cat-btn[data-category="TÜM KATEGORİLER"]').addEventListener("click", () => {
  state.main = "TÜM KATEGORİLER";
  state.sub = "TÜM ALT KATEGORİLER";
  initFilters();
  render();
});
els.sub.addEventListener("change", () => {
  state.sub = els.sub.value;
  state.quick = "all";
  render();
});
els.search.addEventListener("input", () => {
  state.search = els.search.value;
  render();
});
$("searchTop").addEventListener("input", (e) => {
  els.search.value = e.target.value;
  state.search = e.target.value;
  render();
});
els.status.addEventListener("change", () => {
  state.status = els.status.value;
  state.quick = "all";
  render();
});
els.missing.addEventListener("change", () => {
  state.missing = els.missing.value;
  state.quick = "all";
  render();
});
els.body.addEventListener("click", (e) => {
  const mb = e.target.closest("[data-market]"),
    del = e.target.closest("[data-delete]");
  if (mb) return cycle(mb.dataset.id, mb.dataset.market);
  if (del) return deleteProduct(del.dataset.delete);
});
$("restoreAll").addEventListener("click", () => {
  renderTrash();
  openModal("trashModal");
});
$("restoreSide").addEventListener("click", () => {
  renderTrash();
  openModal("trashModal");
});
$("restoreAllInside").addEventListener("click", () => {
  if (!state.deleted.size) return;
  if (confirm(`${state.deleted.size} silinen ürünün tamamı geri getirilsin mi?`)) {
    state.deleted.clear();
    saveLocal();
    renderTrash();
    render();
  }
});
els.exportCsv.addEventListener("click", exportCsv);
$("clearRecent").addEventListener("click", () => {
  state.recent = [];
  saveRecent();
  renderRecent();
});
document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => quickFilter(b.dataset.quick)));
document.querySelector('[data-close="trashModal"]')?.addEventListener("click", () => closeModal("trashModal"));
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-restore]");
  if (r) restoreProduct(r.dataset.restore);
});
(function mobile() {
  const panel = document.querySelector(".filters-panel"),
    toggle = $("mobileFilterToggle"),
    btn = $("mobileScrollBtn");
  const isM = () => matchMedia("(max-width:700px)").matches;
  function upd() {
    if (!isM()) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "flex";
    const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 260;
    btn.textContent = bottom ? "↑ Başa Dön" : "↓ Listenin Sonuna";
  }
  toggle?.addEventListener("click", () => panel.classList.toggle("is-open"));
  btn?.addEventListener("click", () => {
    const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 260;
    window.scrollTo({ top: bottom ? 0 : document.documentElement.scrollHeight, behavior: "smooth" });
  });
  addEventListener("scroll", upd, { passive: true });
  addEventListener("resize", upd);
  upd();
})();
loadLocal();
applyPending();
initFilters();
render();
loadGoogle();
