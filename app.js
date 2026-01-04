const STORAGE_KEY = "counter_pwa_v2";

const elList = document.getElementById("list");
const elEmpty = document.getElementById("emptyState");

const addCategoryBtn = document.getElementById("addCategoryBtn");
const backupBtn = document.getElementById("backupBtn");

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

let state = loadState();
let pendingSubForCategoryId = null;

let pendingEdit = null;     // { kind: "cat"|"sub", catId, subId? }
let pendingConfirm = null;  // fn

let draggingCatId = null;

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { categories: [] };

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories)) return { categories: [] };

    parsed.categories.forEach(c => {
      if (typeof c.count !== "number") c.count = 0;
      if (!Array.isArray(c.subs)) c.subs = [];
      c.subs.forEach(s => { if (typeof s.count !== "number") s.count = 0; });
    });

    return parsed;
  } catch {
    return { categories: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findCategory(catId) {
  return state.categories.find(c => c.id === catId);
}

function moveCategory(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const arr = state.categories;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  saveState();
  render();
}

function incCategory(catId, delta) {
  const cat = findCategory(catId);
  if (!cat) return;
  cat.count = clampMinZero(quantizeHalf(cat.count + delta));
  saveState();
  render();
}

function incSub(catId, subId, delta) {
  const cat = findCategory(catId);
  if (!cat) return;
  const sub = cat.subs.find(s => s.id === subId);
  if (!sub) return;
  sub.count = clampMinZero(quantizeHalf(sub.count + delta));
  saveState();
  render();
}

function addCategory(name) {
  state.categories.unshift({
    id: uid(),
    name: name.trim(),
    count: 0,
    subs: []
  });
  saveState();
  render();
}

function addSubcategory(catId, name) {
  const cat = findCategory(catId);
  if (!cat) return;
  cat.subs.push({
    id: uid(),
    name: name.trim(),
    count: 0
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

function buildExportPayload() {
  return {
    version: 2,
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

  const normalized = { categories: [] };

  for (const c of maybeData.categories) {
    if (!c || typeof c.name !== "string") continue;

    const cat = {
      id: typeof c.id === "string" ? c.id : uid(),
      name: c.name.trim() || "Sin nombre",
      count: typeof c.count === "number" ? quantizeHalf(c.count) : 0,
      subs: []
    };

    if (Array.isArray(c.subs)) {
      for (const s of c.subs) {
        if (!s || typeof s.name !== "string") continue;
        cat.subs.push({
          id: typeof s.id === "string" ? s.id : uid(),
          name: s.name.trim() || "Sin nombre",
          count: typeof s.count === "number" ? quantizeHalf(s.count) : 0
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

function render() {
  elList.innerHTML = "";

  if (state.categories.length === 0) {
    elEmpty.classList.remove("hidden");
    return;
  }
  elEmpty.classList.add("hidden");

  for (const cat of state.categories) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.catId = cat.id;
    card.draggable = true; // drag nativo
    card.dataset.action = "drag-card";

    // Drag events
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

    const row = document.createElement("div");
    row.className = "row";

    const tap = document.createElement("div");
    tap.className = "tapArea";
    tap.dataset.action = "inc-cat";
    tap.dataset.catId = cat.id;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = cat.name;

    const count = document.createElement("div");
    count.className = "count";
    count.textContent = fmtCount(cat.count);

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

    const addSub = document.createElement("button");
    addSub.className = "smallbtn";
    addSub.textContent = "＋ sub";
    addSub.type = "button";
    addSub.dataset.action = "add-sub";
    addSub.dataset.catId = cat.id;

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
    tools.appendChild(addSub);
    tools.appendChild(del);

    row.appendChild(tap);
    row.appendChild(tools);

    card.appendChild(row);

    const stepBar = document.createElement("div");
    stepBar.className = "stepBar";
    stepBar.innerHTML = `
      <button class="stepBtn plus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="0.5" type="button">+0,5</button>
      <button class="stepBtn minus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="-0.5" type="button">-0,5</button>
      <button class="stepBtn minus" data-action="cat-delta" data-cat-id="${cat.id}" data-delta="-1" type="button">-1</button>
    `;
    card.appendChild(stepBar);

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

        const subDel = document.createElement("button");
        subDel.className = "smallbtn danger";
        subDel.textContent = "Borrar";
        subDel.type = "button";
        subDel.dataset.action = "del-sub";
        subDel.dataset.catId = cat.id;
        subDel.dataset.subId = sub.id;

        subTools.appendChild(subEdit);
        subTools.appendChild(subDel);

        subTop.appendChild(subTap);
        subTop.appendChild(subTools);

        const subSteps = document.createElement("div");
        subSteps.className = "stepBar";
        subSteps.innerHTML = `
          <button class="stepBtn plus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="0.5" type="button">+0,5</button>
          <button class="stepBtn minus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="-0.5" type="button">-0,5</button>
          <button class="stepBtn minus" data-action="sub-delta" data-cat-id="${cat.id}" data-sub-id="${sub.id}" data-delta="-1" type="button">-1</button>
        `;

        subItem.appendChild(subTop);
        subItem.appendChild(subSteps);

        subs.appendChild(subItem);
      }

      card.appendChild(subs);
    }

    elList.appendChild(card);
  }
}

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
    state = { categories: [] };
    saveState();
    render();
    backupDialog.close();
  });
});

elList.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const catId = target.dataset.catId || target.dataset.catId;
  const subId = target.dataset.subId;

  if (action === "inc-cat") incCategory(target.dataset.catId, 1);
  if (action === "inc-sub") incSub(target.dataset.catId, target.dataset.subId, 1);

  if (action === "cat-delta") {
    const delta = Number(target.dataset.delta);
    incCategory(target.dataset.catId, delta);
  }

  if (action === "sub-delta") {
    const delta = Number(target.dataset.delta);
    incSub(target.dataset.catId, target.dataset.subId, delta);
  }

  if (action === "add-sub") {
    const cat = findCategory(target.dataset.catId);
    pendingSubForCategoryId = target.dataset.catId;
    subNameInput.value = "";
    subFor.textContent = `Para: ${cat ? cat.name : ""}`;
    subDialog.showModal();
    setTimeout(() => subNameInput.focus(), 50);
  }

  if (action === "edit-cat") {
    openEdit("cat", target.dataset.catId);
  }

  if (action === "edit-sub") {
    openEdit("sub", target.dataset.catId, target.dataset.subId);
  }

  if (action === "del-cat") {
    const cat = findCategory(target.dataset.catId);
    openConfirm(`¿Borrar la categoría “${cat?.name ?? ""}” y todas sus subcategorías?`, () => deleteCategory(target.dataset.catId));
  }

  if (action === "del-sub") {
    const cat = findCategory(target.dataset.catId);
    const sub = cat?.subs?.find(s => s.id === target.dataset.subId);
    openConfirm(`¿Borrar la subcategoría “${sub?.name ?? ""}”?`, () => deleteSub(target.dataset.catId, target.dataset.subId));
  }

  if (action === "move-up") {
    const id = target.dataset.catId;
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx > 0) moveCategory(idx, idx - 1);
  }

  if (action === "move-down") {
    const id = target.dataset.catId;
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx >= 0 && idx < state.categories.length - 1) moveCategory(idx, idx + 1);
  }
});

render();
