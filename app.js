const STORAGE_KEY = "counter_pwa_v3";

const elList = document.getElementById("list");
const elEmpty = document.getElementById("emptyState");

const addCategoryBtn = document.getElementById("addCategoryBtn");
const backupBtn = document.getElementById("backupBtn");

// Dialogs existentes
const categoryDialog = document.getElementById("categoryDialog");
const categoryForm = document.getElementById("categoryForm");
const categoryNameInput = document.getElementById("categoryName");

const subDialog = document.getElementById("subDialog");
const subForm = document.getElementById("subForm");
const subNameInput = document.getElementById("subName");
const subFor = document.getElementById("subFor");

const editDialog = document.getElementById("editDialog");
const editForm = document.getElementById("editForm");
const editNameInput = document.getElementById("editName");
const editHint = document.getElementById("editHint");

const backupDialog = document.getElementById("backupDialog");
const exportArea = document.getElementById("exportArea");
const importArea = document.getElementById("importArea");
const copyExportBtn = document.getElementById("copyExportBtn");
const downloadExportBtn = document.getElementById("downloadExportBtn");
const importPasteBtn = document.getElementById("importPasteBtn");
const importFile = document.getElementById("importFile");
const resetBtn = document.getElementById("resetBtn");

const confirmDialog = document.getElementById("confirmDialog");
const confirmText = document.getElementById("confirmText");
const confirmOk = document.getElementById("confirmOk");

// Nuevo: historial
const historyDialog = document.getElementById("historyDialog");
const historyHint = document.getElementById("historyHint");
const historyBody = document.getElementById("historyBody");

let state = loadState();
let pendingSubForCategoryId = null;
let pendingEdit = null;      // { kind: "cat"|"sub", catId, subId? }
let pendingConfirm = null;   // fn

// Drag state
let draggingCatId = null;

// ---------------- Utils ----------------
function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** redondea a múltiplos de 0.5 y evita floats raros */
function quantizeHalf(n) {
  return Math.round(n * 2) / 2;
}

function clampMinZero(n) {
  return n < 0 ? 0 : n;
}

function fmtCount(n) {
  const q = quantizeHalf(n);
  return Number.isInteger(q) ? String(q) : q.toFixed(1);
}

function pad2(x) { return String(x).padStart(2, "0"); }

function dayKey(d = new Date()) {
  // local timezone del dispositivo
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${da} ${hh}:${mm}`;
}

function relativeDayLabel(key) {
  const today = dayKey(new Date());
  // "ayer" simple
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yKey = dayKey(yesterday);

  if (key === today) return "Hoy";
  if (key === yKey) return "Ayer";
  return key;
}

// ---------------- State load/save/normalize ----------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { categories: [], ui: { showArchived: false } };

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories)) return { categories: [], ui: { showArchived: false } };

    // ui
    if (!parsed.ui) parsed.ui = { showArchived: false };
    if (typeof parsed.ui.showArchived !== "boolean") parsed.ui.showArchived = false;

    // Normalize categories/subs
    parsed.categories.forEach(c => normalizeCategory(c));
    return parsed;
  } catch {
    return { categories: [], ui: { showArchived: false } };
  }
}

function normalizeCategory(c) {
  if (!c) return;
  if (typeof c.id !== "string") c.id = uid();
  if (typeof c.name !== "string") c.name = "Sin nombre";
  if (typeof c.count !== "number") c.count = 0;
  if (!Array.isArray(c.subs)) c.subs = [];

  // archivado
  if (typeof c.archived !== "boolean") c.archived = false;

  // historial
  if (typeof c.lastUpdatedAt !== "number") c.lastUpdatedAt = 0;
  if (!c.historyByDay || typeof c.historyByDay !== "object") c.historyByDay = {};

  c.subs.forEach(s => normalizeSub(s));
}

function normalizeSub(s) {
  if (!s) return;
  if (typeof s.id !== "string") s.id = uid();
  if (typeof s.name !== "string") s.name = "Sin nombre";
  if (typeof s.count !== "number") s.count = 0;

  if (typeof s.lastUpdatedAt !== "number") s.lastUpdatedAt = 0;
  if (!s.historyByDay || typeof s.historyByDay !== "object") s.historyByDay = {};
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findCategory(catId) {
  return state.categories.find(c => c.id === catId);
}

function isDerived(cat) {
  return Array.isArray(cat.subs) && cat.subs.length > 0;
}

function derivedCount(cat) {
  if (!isDerived(cat)) return quantizeHalf(cat.count);
  const sum = cat.subs.reduce((acc, s) => acc + (typeof s.count === "number" ? s.count : 0), 0);
  return quantizeHalf(sum);
}

function getCatLastUpdated(cat) {
  if (!isDerived(cat)) return cat.lastUpdatedAt || 0;
  // si es derivada, la última actualización es el max de sus subs
  let maxTs = 0;
  for (const s of cat.subs) {
    if (s.lastUpdatedAt && s.lastUpdatedAt > maxTs) maxTs = s.lastUpdatedAt;
  }
  return maxTs;
}

// historial: registrar cambio
function logChange(targetObj, delta) {
  const now = Date.now();
  const key = dayKey(new Date(now));

  if (!targetObj.historyByDay || typeof targetObj.historyByDay !== "object") targetObj.historyByDay = {};
  if (!targetObj.historyByDay[key]) targetObj.historyByDay[key] = { delta: 0, lastAt: 0 };

  targetObj.historyByDay[key].delta = quantizeHalf((targetObj.historyByDay[key].delta || 0) + delta);
  targetObj.historyByDay[key].lastAt = now;
  targetObj.lastUpdatedAt = now;
}

// historial agregado para categoría derivada
function getAggregatedHistoryForCat(cat) {
  // devuelve map: day -> {delta, lastAt}
  if (!isDerived(cat)) return cat.historyByDay || {};

  const agg = {};
  for (const s of cat.subs) {
    const h = s.historyByDay || {};
    for (const [day, info] of Object.entries(h)) {
      if (!agg[day]) agg[day] = { delta: 0, lastAt: 0 };
      agg[day].delta = quantizeHalf(agg[day].delta + (info.delta || 0));
      agg[day].lastAt = Math.max(agg[day].lastAt || 0, info.lastAt || 0);
    }
  }
  return agg;
}

// ---------------- Core actions ----------------
function moveCategory(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const arr = state.categories;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  saveState();
  render();
}

function addCategory(name) {
  state.categories.unshift({
    id: uid(),
    name: name.trim(),
    count: 0,
    subs: [],
    archived: false,
    lastUpdatedAt: 0,
    historyByDay: {}
  });
  saveState();
  render();
}

function addSubcategory(catId, name) {
  const cat = findCategory(catId);
  if (!cat) return;

  // Si es la primera sub y la categoría ya tenía conteo, lo preservamos en "General"
  if (cat.subs.length === 0 && cat.count > 0) {
    cat.subs.push({
      id: uid(),
      name: "General",
      count: quantizeHalf(cat.count),
      lastUpdatedAt: cat.lastUpdatedAt || 0,
      historyByDay: { ...(cat.historyByDay || {}) }
    });
    cat.count = 0;
    cat.lastUpdatedAt = 0;
    cat.historyByDay = {};
  }

  cat.subs.push({
    id: uid(),
    name: name.trim(),
    count: 0,
    lastUpdatedAt: 0,
    historyByDay: {}
  });

  saveState();
  render();
}

function renameCategory(catId, newName) {
  const cat = findCategory(catId);
  if (!cat) return;
  cat.name = newName.trim();
  saveState();
  render();
}

function renameSub(catId, subId, newName) {
  const cat = findCategory(catId);
  if (!cat) return;
  const sub = cat.subs.find(s => s.id === subId);
  if (!sub) return;
  sub.name = newName.trim();
  saveState();
  render();
}

function toggleArchive(catId) {
  const cat = findCategory(catId);
  if (!cat) return;
  cat.archived = !cat.archived;
  saveState();
  render();
}

function deleteCategory(catId) {
  state.categories = state.categories.filter(c => c.id !== catId);
  saveState();
  render();
}

function deleteSub(catId, subId) {
  const cat = findCategory(catId);
  if (!cat) return;
  cat.subs = cat.subs.filter(s => s.id !== subId);
  saveState();
  render();
}

// Cambios de contador
function applyDeltaToCategory(catId, delta) {
  const cat = findCategory(catId);
  if (!cat) return;
  // si es derivada, NO se puede modificar
  if (isDerived(cat)) return;

  cat.count = clampMinZero(quantizeHalf(cat.count + delta));
  logChange(cat, delta);
  saveState();
  render();
}

function applyDeltaToSub(catId, subId, delta) {
  const cat = findCategory(catId);
  if (!cat) return;
  const sub = cat.subs.find(s => s.id === subId);
  if (!sub) return;

  sub.count = clampMinZero(quantizeHalf(sub.count + delta));
  logChange(sub, delta);
  saveState();
  render();
}

// ---------------- Dialog helpers ----------------
function openConfirm(text, onOk) {
  pendingConfirm = onOk;
  confirmText.textContent = text;
  confirmDialog.showModal();
}

function openEdit(kind, catId, subId = null) {
  pendingEdit = { kind, catId, subId };
  if (kind === "cat") {
    const cat = findCategory(catId);
    editHint.textContent = `Categoría: ${cat?.name ?? ""}`;
    editNameInput.value = cat?.name ?? "";
  } else {
    const cat = findCategory(catId);
    const sub = cat?.subs?.find(s => s.id === subId);
    editHint.textContent = `Subcategoría de ${cat?.name ?? ""}`;
    editNameInput.value = sub?.name ?? "";
  }
  editDialog.showModal();
  setTimeout(() => editNameInput.focus(), 50);
}

function openHistory(kind, catId, subId = null) {
  let title = "";
  let historyMap = {};
  if (kind === "cat") {
    const cat = findCategory(catId);
    title = `Categoría: ${cat?.name ?? ""}`;
    historyMap = getAggregatedHistoryForCat(cat);
  } else {
    const cat = findCategory(catId);
    const sub = cat?.subs?.find(s => s.id === subId);
    title = `Subcategoría: ${sub?.name ?? ""} (${cat?.name ?? ""})`;
    historyMap = sub?.historyByDay || {};
  }

  historyHint.textContent = title;
  historyBody.innerHTML = "";

  const entries = Object.entries(historyMap)
    .map(([day, info]) => ({ day, delta: info.delta || 0, lastAt: info.lastAt || 0 }))
    .sort((a, b) => (a.day < b.day ? 1 : -1)); // desc

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color: rgba(156,163,175,.95);">Sin movimientos aún.</td>`;
    historyBody.appendChild(tr);
  } else {
    for (const e of entries) {
      const tr = document.createElement("tr");
      const deltaClass = e.delta >= 0 ? "badgePos" : "badgeNeg";
      const deltaText = (e.delta >= 0 ? "+" : "") + fmtCount(e.delta);
      tr.innerHTML = `
        <td>${relativeDayLabel(e.day)}</td>
        <td class="${deltaClass}">${deltaText}</td>
        <td>${fmtDateTime(e.lastAt)}</td>
      `;
      historyBody.appendChild(tr);
    }
  }

  historyDialog.showModal();
}

// ---------------- Backup (igual que v2, pero incluye nuevos campos) ----------------
function buildExportPayload() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    data: state
  };
}

function refreshExportArea() {
  exportArea.value = JSON.stringify(buildExportPayload(), null, 2);
}

function importPayload(jsonText) {
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("JSON inválido (no se puede parsear).");
  }

  const maybeData = (obj && obj.data && obj.data.categories) ? obj.data : obj;
  if (!maybeData || !Array.isArray(maybeData.categories)) {
    throw new Error("Formato inválido: falta 'categories'.");
  }

  const normalized = { categories: [], ui: { showArchived: false } };

  // ui opcional
  if (maybeData.ui && typeof maybeData.ui.showArchived === "boolean") {
    normalized.ui.showArchived = maybeData.ui.showArchived;
  }

  for (const c of maybeData.categories) {
    if (!c || typeof c.name !== "string") continue;

    const cat = {
      id: typeof c.id === "string" ? c.id : uid(),
      name: c.name.trim() || "Sin nombre",
      count: typeof c.count === "number" ? quantizeHalf(c.count) : 0,
      subs: [],
      archived: typeof c.archived === "boolean" ? c.archived : false,
      lastUpdatedAt: typeof c.lastUpdatedAt === "number" ? c.lastUpdatedAt : 0,
      historyByDay: (c.historyByDay && typeof c.historyByDay === "object") ? c.historyByDay : {}
    };

    if (Array.isArray(c.subs)) {
      for (const s of c.subs) {
        if (!s || typeof s.name !== "string") continue;
        cat.subs.push({
          id: typeof s.id === "string" ? s.id : uid(),
          name: s.name.trim() || "Sin nombre",
          count: typeof s.count === "number" ? quantizeHalf(s.count) : 0,
          lastUpdatedAt: typeof s.lastUpdatedAt === "number" ? s.lastUpdatedAt : 0,
          historyByDay: (s.historyByDay && typeof s.historyByDay === "object") ? s.historyByDay : {}
        });
      }
    }

    cat.count = clampMinZero(cat.count);
    cat.subs.forEach(s => s.count = clampMinZero(s.count));

    normalized.categories.push(cat);
  }

  state = normalized;
  saveState();
  render();
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------- Render ----------------
function render() {
  elList.innerHTML = "";

  const active = state.categories.filter(c => !c.archived);
  const archived = state.categories.filter(c => c.archived);

  if (active.length === 0 && archived.length === 0) {
    elEmpty.classList.remove("hidden");
    return;
  }
  elEmpty.classList.add("hidden");

  // Render activos
  for (const cat of active) {
    elList.appendChild(renderCategoryCard(cat));
  }

  // Render sección archivados
  if (archived.length > 0) {
    const head = document.createElement("div");
    head.className = "sectionHead";
    head.innerHTML = `
      <div class="sectionTitle">Archivadas (${archived.length})</div>
      <button class="sectionBtn" type="button" data-action="toggle-archived-view">
        ${state.ui.showArchived ? "Ocultar" : "Mostrar"}
      </button>
    `;
    elList.appendChild(head);

    if (state.ui.showArchived) {
      for (const cat of archived) {
        elList.appendChild(renderCategoryCard(cat, { isArchivedSection: true }));
      }
    }
  }
}

function renderCategoryCard(cat, opts = {}) {
  const isArch = !!cat.archived;
  const derived = isDerived(cat);
  const displayCount = derived ? derivedCount(cat) : quantizeHalf(cat.count);
  const lastTs = getCatLastUpdated(cat);

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.catId = cat.id;
  card.draggable = true;

  // Drag events (solo para categorías activas; igual lo dejamos, pero no es crítico)
  card.addEventListener("dragstart", (e) => {
    draggingCatId = cat.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cat.id);
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    card.classList.add("dragOver");
    e.dataTransfer.dropEffect = "move";
  });

  card.addEventListener("dragleave", () => card.classList.remove("dragOver"));

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("dragOver");

    const fromId = e.dataTransfer.getData("text/plain") || draggingCatId;
    const toId = cat.id;
    if (!fromId || fromId === toId) return;

    const fromIndex = state.categories.findIndex(c => c.id === fromId);
    const toIndex = state.categories.findIndex(c => c.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    moveCategory(fromIndex, toIndex);
    draggingCatId = null;
  });

  // Top row
  const row = document.createElement("div");
  row.className = "row";

  const tap = document.createElement("div");
  tap.className = "tapArea" + (derived ? " locked" : "");
  tap.dataset.action = derived ? "noop" : "inc-cat";
  tap.dataset.catId = cat.id;

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = cat.name;

  const count = document.createElement("div");
  count.className = "count";
  count.textContent = fmtCount(displayCount);

  tap.appendChild(name);
  tap.appendChild(count);

  const tools = document.createElement("div");
  tools.className = "tools";

  const drag = document.createElement("button");
  drag.className = "smallbtn ghost dragHandle";
  drag.textContent = "≡";
  drag.title = "Arrastrá para reordenar";
  drag.type = "button";

  const up = document.createElement("button");
  up.className = "smallbtn";
  up.textContent = "↑";
  up.title = "Subir";
  up.type = "button";
  up.dataset.action = "move-up";
  up.dataset.catId = cat.id;

  const down = document.createElement("button");
  down.className = "smallbtn";
  down.textContent = "↓";
  down.title = "Bajar";
  down.type = "button";
  down.dataset.action = "move-down";
  down.dataset.catId = cat.id;

  const edit = document.createElement("button");
  edit.className = "smallbtn";
  edit.textContent = "Editar";
  edit.type = "button";
  edit.dataset.action = "edit-cat";
  edit.dataset.catId = cat.id;

  const hist = document.createElement("button");
  hist.className = "smallbtn";
  hist.textContent = "Hist";
  hist.type = "button";
  hist.dataset.action = "hist-cat";
  hist.dataset.catId = cat.id;

  const addSub = document.createElement("button");
  addSub.className = "smallbtn";
  addSub.textContent = "＋ sub";
  addSub.type = "button";
  addSub.dataset.action = "add-sub";
  addSub.dataset.catId = cat.id;

  const arch = document.createElement("button");
  arch.className = "smallbtn";
  arch.textContent = isArch ? "Desarch" : "Archivar";
  arch.type = "button";
  arch.dataset.action = "toggle-archive";
  arch.dataset.catId = cat.id;

  const del = document.createElement("button");
  del.className = "smallbtn danger";
  del.textContent = "Borrar";
  del.type = "button";
  del.dataset.action = "del-cat";
  del.dataset.catId = cat.id;

  tools.appendChild(drag);
  tools.appendChild(up);
  tools.appendChild(down);
  tools.appendChild(edit);
  tools.appendChild(hist);
  tools.appendChild(addSub);
  tools.appendChild(arch);
  tools.appendChild(del);

  row.appendChild(tap);
  row.appendChild(tools);

  card.appendChild(row);

  // Meta: última actualización + hint derivado
  const meta = document.createElement("div");
  meta.className = "metaLine";
  meta.textContent = `Última actualización: ${fmtDateTime(lastTs)}`;
  card.appendChild(meta);

  if (derived) {
    const hint = document.createElement("div");
    hint.className = "lockHint";
    hint.textContent = "Esta categoría suma automáticamente sus subcategorías (no se puede sumar desde el padre).";
    card.appendChild(hint);
  }

  // Step bar (solo si NO es derivada)
  if (!derived) {
    const stepBar = document.createElement("div");
    stepBar.className = "stepBar";
    stepBar.innerHTML = `
      <button class="stepBtn plus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="0.5" type="button">+0,5</button>
      <button class="stepBtn minus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="-0.5" type="button">-0,5</button>
      <button class="stepBtn minus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="-1" type="button">-1</button>
    `;
    card.appendChild(stepBar);
  }

  // Subcategorías
  if (cat.subs && cat.subs.length > 0) {
    const subs = document.createElement("div");
    subs.className = "subs";

    for (const sub of cat.subs) {
      const subItem = document.createElement("div");
      subItem.className = "subItem";

      const subTop = document.createElement("div");
      subTop.className = "subTop";

      const subTap = document.createElement("div");
      subTap.className = "subTap";
      subTap.dataset.action = "inc-sub";
      subTap.dataset.catId = cat.id;
      subTap.dataset.subId = sub.id;

      const subName = document.createElement("div");
      subName.className = "subName";
      subName.textContent = sub.name;

      const subCount = document.createElement("div");
      subCount.className = "subCount";
      subCount.textContent = fmtCount(sub.count);

      subTap.appendChild(subName);
      subTap.appendChild(subCount);

      const subTools = document.createElement("div");
      subTools.className = "tools";

      const subEdit = document.createElement("button");
      subEdit.className = "smallbtn";
      subEdit.textContent = "Editar";
      subEdit.type = "button";
      subEdit.dataset.action = "edit-sub";
      subEdit.dataset.catId = cat.id;
      subEdit.dataset.subId = sub.id;

      const subHist = document.createElement("button");
      subHist.className = "smallbtn";
      subHist.textContent = "Hist";
      subHist.type = "button";
      subHist.dataset.action = "hist-sub";
      subHist.dataset.catId = cat.id;
      subHist.dataset.subId = sub.id;

      const subDel = document.createElement("button");
      subDel.className = "smallbtn danger";
      subDel.textContent = "Borrar";
      subDel.type = "button";
      subDel.dataset.action = "del-sub";
      subDel.dataset.catId = cat.id;
      subDel.dataset.subId = sub.id;

      subTools.appendChild(subEdit);
      subTools.appendChild(subHist);
      subTools.appendChild(subDel);

      subTop.appendChild(subTap);
      subTop.appendChild(subTools);

      const subMeta = document.createElement("div");
      subMeta.className = "metaLine";
      subMeta.textContent = `Última actualización: ${fmtDateTime(sub.lastUpdatedAt)}`;

      const subSteps = document.createElement("div");
      subSteps.className = "stepBar";
      subSteps.innerHTML = `
        <button class="stepBtn plus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="0.5" type="button">+0,5</button>
        <button class="stepBtn minus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="-0.5" type="button">-0,5</button>
        <button class="stepBtn minus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="-1" type="button">-1</button>
      `;

      subItem.appendChild(subTop);
      subItem.appendChild(subMeta);
      subItem.appendChild(subSteps);

      subs.appendChild(subItem);
    }

    card.appendChild(subs);
  }

  return card;
}

// ---------------- UI events ----------------
addCategoryBtn.addEventListener("click", () => {
  categoryNameInput.value = "";
  categoryDialog.showModal();
  setTimeout(() => categoryNameInput.focus(), 50);
});

categoryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = categoryNameInput.value.trim();
  if (!name) return;
  addCategory(name);
  categoryDialog.close();
});

subForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = subNameInput.value.trim();
  if (!name || !pendingSubForCategoryId) return;
  addSubcategory(pendingSubForCategoryId, name);
  pendingSubForCategoryId = null;
  subDialog.close();
});

editForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const newName = editNameInput.value.trim();
  if (!newName || !pendingEdit) return;

  if (pendingEdit.kind === "cat") {
    renameCategory(pendingEdit.catId, newName);
  } else {
    renameSub(pendingEdit.catId, pendingEdit.subId, newName);
  }

  pendingEdit = null;
  editDialog.close();
});

confirmOk.addEventListener("click", () => {
  if (typeof pendingConfirm === "function") pendingConfirm();
  pendingConfirm = null;
});

// Backup dialog
backupBtn.addEventListener("click", () => {
  refreshExportArea();
  importArea.value = "";
  backupDialog.showModal();
});

copyExportBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportArea.value);
    copyExportBtn.textContent = "Copiado ✓";
    setTimeout(() => (copyExportBtn.textContent = "Copiar"), 900);
  } catch {
    exportArea.select();
    document.execCommand("copy");
  }
});

downloadExportBtn.addEventListener("click", () => {
  const content = exportArea.value;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJson(`counters-backup-${ts}.json`, content);
});

importPasteBtn.addEventListener("click", () => {
  const txt = importArea.value.trim();
  if (!txt) return;

  openConfirm("Esto va a reemplazar tus datos actuales. ¿Importar?", () => {
    try {
      importPayload(txt);
      backupDialog.close();
    } catch (err) {
      alert(err.message || "Error importando JSON.");
    }
  });
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;

  const txt = await file.text();
  openConfirm("Esto va a reemplazar tus datos actuales. ¿Importar archivo?", () => {
    try {
      importPayload(txt);
      backupDialog.close();
    } catch (err) {
      alert(err.message || "Error importando archivo JSON.");
    }
  });

  importFile.value = "";
});

resetBtn.addEventListener("click", () => {
  openConfirm("¿Resetear TODO? (borra categorías, subs y contadores)", () => {
    state = { categories: [], ui: { showArchived: false } };
    saveState();
    render();
    backupDialog.close();
  });
});

// Delegación clicks lista
elList.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "toggle-archived-view") {
    state.ui.showArchived = !state.ui.showArchived;
    saveState();
    render();
    return;
  }

  if (action === "noop") return;

  if (action === "inc-cat") {
    applyDeltaToCategory(target.dataset.catId, 1);
    return;
  }
  if (action === "inc-sub") {
    applyDeltaToSub(target.dataset.catId, target.dataset.subId, 1);
    return;
  }

  if (action === "cat-delta") {
    applyDeltaToCategory(target.dataset.catId, Number(target.dataset.delta));
    return;
  }

  if (action === "sub-delta") {
    applyDeltaToSub(target.dataset.catId, target.dataset.subId, Number(target.dataset.delta));
    return;
  }

  if (action === "add-sub") {
    const cat = findCategory(target.dataset.catId);
    pendingSubForCategoryId = target.dataset.catId;
    subNameInput.value = "";
    subFor.textContent = `Para: ${cat ? cat.name : ""}`;
    subDialog.showModal();
    setTimeout(() => subNameInput.focus(), 50);
    return;
  }

  if (action === "edit-cat") {
    openEdit("cat", target.dataset.catId);
    return;
  }
  if (action === "edit-sub") {
    openEdit("sub", target.dataset.catId, target.dataset.subId);
    return;
  }

  if (action === "hist-cat") {
    openHistory("cat", target.dataset.catId);
    return;
  }
  if (action === "hist-sub") {
    openHistory("sub", target.dataset.catId, target.dataset.subId);
    return;
  }

  if (action === "toggle-archive") {
    toggleArchive(target.dataset.catId);
    return;
  }

  if (action === "del-cat") {
    const cat = findCategory(target.dataset.catId);
    openConfirm(`¿Borrar la categoría “${cat?.name ?? ""}” y todas sus subcategorías?`, () => deleteCategory(target.dataset.catId));
    return;
  }

  if (action === "del-sub") {
    const cat = findCategory(target.dataset.catId);
    const sub = cat?.subs?.find(s => s.id === target.dataset.subId);
    openConfirm(`¿Borrar la subcategoría “${sub?.name ?? ""}”?`, () => deleteSub(target.dataset.catId, target.dataset.subId));
    return;
  }

  if (action === "move-up") {
    const id = target.dataset.catId;
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx > 0) moveCategory(idx, idx - 1);
    return;
  }

  if (action === "move-down") {
    const id = target.dataset.catId;
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx >= 0 && idx < state.categories.length - 1) moveCategory(idx, idx + 1);
    return;
  }
});

// Primera render
render();
