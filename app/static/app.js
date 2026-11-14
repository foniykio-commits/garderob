const state = {
  view: "home",
  q: "",
  category: "all",
  forgottenOnly: false,
  month: "",
  selectedDate: "",
  today: null,
  stats: null,
  history: [],
  historyLoaded: false,
  calendar: {},
  shop: null,
  pending: [],
  addCategory: "top",
  addSubtype: "",
  shopCategory: "",
  shopSubtype: "",
  loading: false,
  busy: false,
  fit: null,
  dockTab: "look",
  lookRail: "hair",
  styleRail: "top",
};

let meta = null;
let profile = null;
let items = [];
let toastTimer = null;

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEK = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];
const TITLES = {
  home: ["Xona", "3D"],
  wardrobe: ["Kutubxona", "Garderob"],
  add: ["Yangi", "Kiyim qo'shish"],
  stylist: ["Maslahat", "AI stilist"],
  calendar: ["Tarix", "Taqvim"],
  shop: ["Do'kon", "Xarid maslahati"],
  stats: ["Hisob", "Statistika"],
  profile: ["Siz", "Profil"],
  fit: ["Maket", "3D kiyib ko'rish"],
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function localISO(day = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

async function api(path, options = {}) {
  document.getElementById("progress").classList.add("go");
  try {
    const response = await fetch(path, options);
    if (!response.ok) {
      let message = "Xatolik yuz berdi";
      try {
        const payload = await response.json();
        if (typeof payload.detail === "string") message = payload.detail;
      } catch (_err) { /* javob JSON emas */ }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  } finally {
    document.getElementById("progress").classList.remove("go");
  }
}

function crc32(data) {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, file.data);
    const entry = new Uint8Array(46 + name.length);
    const centralView = new DataView(entry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length + file.data.length;
  }
  let centralSize = 0;
  for (const entry of central) centralSize += entry.length;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
}

function openModal(html) {
  const modal = document.getElementById("modal");
  modal.innerHTML = `<div class="sheet">${html}</div>`;
  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.add("hidden");
  modal.innerHTML = "";
}

function tabFor(view) {
  if (["shop", "stats", "profile", "fit"].includes(view)) return "more";
  if (view === "add") return "wardrobe";
  return view;
}

function optionTags(list, current, placeholder) {
  const rows = [];
  if (placeholder) rows.push(`<option value="">${esc(placeholder)}</option>`);
  for (const item of list) {
    const key = item.key || item;
    const label = item.label || item;
    rows.push(`<option value="${esc(key)}"${key === current ? " selected" : ""}>${esc(label)}</option>`);
  }
  return rows.join("");
}

function subtypeOptions(category, current) {
  return optionTags(meta.subtypes[category] || [], current, "Turini tanlang");
}

function photo(item, full) {
  const src = full ? item.image_url : (item.thumb_url || item.image_url);
  return `<img src="${esc(src)}" alt="${esc(item.name)}" loading="lazy" decoding="async">`;
}

function skeleton(cards = 4) {
  const bones = Array.from({ length: cards }, () => `<div class="bone photo"></div><div class="bone"></div><div class="bone short"></div>`).join("");
  return `<div class="skeleton" aria-busy="true">${bones}</div>`;
}

function idb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("garderob", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const request = tx.objectStore("kv").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (_error) {
    return null;
  }
}

async function saveSnapshot() {
  if (!meta || !profile) return;
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put({ meta, profile, items, today: state.today, history: state.history }, "snapshot");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (_error) { /* xotira yozilmasa ham ilova ishlaydi */ }
}

async function shrinkFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    let quality = 0.82;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    while (blob && blob.size > 100 * 1024 && quality > 0.5) {
      quality -= 0.08;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    }
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "kiyim.webp", { type: "image/webp" });
  } catch (_error) {
    return file;
  }
}

async function cutGarment(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const width = canvas.width;
  const height = canvas.height;
  const corners = [0, width - 1, (height - 1) * width, (height - 1) * width + (width - 1)];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const cursor of corners) {
    red += pixels[cursor * 4];
    green += pixels[cursor * 4 + 1];
    blue += pixels[cursor * 4 + 2];
  }
  red /= 4;
  green /= 4;
  blue /= 4;
  const seen = new Uint8Array(width * height);
  const queue = corners.slice();
  for (const start of queue) seen[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const cursor = queue[head];
    head += 1;
    const x = cursor % width;
    const index = cursor * 4;
    const distance = Math.abs(pixels[index] - red) + Math.abs(pixels[index + 1] - green) + Math.abs(pixels[index + 2] - blue);
    if (distance > 54) continue;
    pixels[index + 3] = 0;
    const nexts = [cursor - width, cursor + width];
    if (x > 0) nexts.push(cursor - 1);
    if (x < width - 1) nexts.push(cursor + 1);
    for (const next of nexts) {
      if (next < 0 || next >= seen.length || seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function clearBackdrop(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const corners = [0, width - 1, (height - 1) * width, (height - 1) * width + (width - 1)];
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const cursor of corners) {
    red += pixels[cursor * 4];
    green += pixels[cursor * 4 + 1];
    blue += pixels[cursor * 4 + 2];
  }
  red /= 4;
  green /= 4;
  blue /= 4;
  const seen = new Uint8Array(width * height);
  const queue = corners.slice();
  for (const start of queue) seen[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const cursor = queue[head];
    head += 1;
    const x = cursor % width;
    const index = cursor * 4;
    const distance = Math.abs(pixels[index] - red) + Math.abs(pixels[index + 1] - green) + Math.abs(pixels[index + 2] - blue);
    if (distance > 48) continue;
    pixels[index + 3] = 0;
    const nexts = [cursor - width, cursor + width];
    if (x > 0) nexts.push(cursor - 1);
    if (x < width - 1) nexts.push(cursor + 1);
    for (const next of nexts) {
      if (next < 0 || next >= seen.length || seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  context.putImageData(image, 0, 0);
}

async function paintPortrait(file, box, features) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 640;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const eyes = (features || []).filter((item) => item.name === "eye");
  if (eyes.length >= 2) {
    const ax = eyes[0].x * bitmap.width;
    const ay = eyes[0].y * bitmap.height;
    const bx = eyes[1].x * bitmap.width;
    const by = eyes[1].y * bitmap.height;
    const gap = Math.max(8, Math.hypot(ax - bx, ay - by));
    const scale = (512 * 0.3) / gap;
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    context.drawImage(bitmap, 256 - midX * scale, 294 - midY * scale, bitmap.width * scale, bitmap.height * scale);
  } else if (box) {
    const x = Math.max(0, box.x * bitmap.width);
    const y = Math.max(0, box.y * bitmap.height);
    const width = Math.max(1, Math.min(bitmap.width - x, box.w * bitmap.width));
    const height = Math.max(1, Math.min(bitmap.height - y, box.h * bitmap.height));
    context.drawImage(bitmap, x, y, width, height, 0, 0, 512, 640);
  } else {
    context.drawImage(bitmap, 0, 0, 512, 640);
  }
  if (bitmap.close) bitmap.close();
  clearBackdrop(context, 512, 640);
  return canvas.toDataURL("image/png");
}

async function readAvatar(files, hint) {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name || "photo.jpg");
  form.append("hint", hint);
  return api("/api/avatar", { method: "POST", body: form });
}

async function applyAvatarFiles(fileList, hint) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/")).slice(0, 4);
  if (!files.length) {
    toast("Rasm tanlanmadi");
    return;
  }
  let result = null;
  try {
    result = await readAvatar(files, hint);
  } catch (error) {
    if (hint === "body") {
      const measured = await measureBody(files[0]);
      if (measured) {
        const fit = ensureFitState();
        fit.height = measured.height;
        fit.weight = measured.weight;
        fit.fromBody = true;
        const height = document.getElementById("fit-height");
        const weight = document.getElementById("fit-weight");
        if (height) height.value = String(fit.height);
        if (weight) weight.value = String(fit.weight);
        syncFit();
        toast("Tana rasmidan bo'y va vazn olindi");
        return;
      }
    }
    toast(error.message || "Rasm o'qilmadi");
    return;
  }
  const fit = ensureFitState();
  fit.skin = result.skin_index;
  fit.skinHex = result.skin_hex;
  fit.fromAvatar = true;
  if (result.hair_hex) fit.hairColor = result.hair_hex;
  if (result.height_cm) {
    fit.height = result.height_cm;
    fit.weight = result.weight_kg;
    fit.fromBody = true;
    fit.shoulder = result.shoulder || 1;
    fit.hips = result.hips || 1;
  }
  const eyes = (result.features || []).filter((item) => item.name === "eye").length;
  fit.agentNote = eyes
    ? `Agent ko'zlarni topdi va yuzni shu chiziqqa qo'ydi. Teri ${result.skin_hex}.`
    : `Agent terini ${result.skin_hex} qilib oldi.`;
  if (result.face_box && Number.isInteger(result.face_index)) {
    try {
      fit.face = await paintPortrait(files[result.face_index], result.face_box, result.features);
    } catch (_error) {
      /* yuz kesimi tushmasa tana rangi baribir qo'llanadi */
    }
  }
  const height = document.getElementById("fit-height");
  const weight = document.getElementById("fit-weight");
  const skin = document.getElementById("fit-skin");
  if (height) height.value = String(fit.height);
  if (weight) weight.value = String(fit.weight);
  if (skin) skin.value = String(fit.skin);
  syncFit();
  const kinds = new Set((result.reads || []).map((row) => row.kind));
  if (kinds.has("body") || kinds.has("side")) toast("Avatar agent tanani shu odamga yaqinlashtirdi");
  else toast("Avatar agent yuz va terini qo'ydi");
}

async function measureBody(file) {
  try {
    const small = await shrinkFile(file);
    const image = await createImageBitmap(small);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 128;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, 64, 128);
    if (image.close) image.close();
    const pixels = context.getImageData(0, 0, 64, 128).data;
    const background = [pixels[0], pixels[1], pixels[2]];
    const rows = [];
    for (let y = 0; y < 128; y += 1) {
      let left = 64;
      let right = 0;
      let count = 0;
      for (let x = 0; x < 64; x += 1) {
        const index = (y * 64 + x) * 4;
        const distance = Math.abs(pixels[index] - background[0]) + Math.abs(pixels[index + 1] - background[1]) + Math.abs(pixels[index + 2] - background[2]);
        if (distance > 48) {
          count += 1;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      rows.push(count > 3 ? right - left : 0);
    }
    const filled = rows.map((width, index) => (width > 0 ? index : -1)).filter((index) => index >= 0);
    if (filled.length < 24) return null;
    const top = filled[0];
    const bottom = filled[filled.length - 1];
    const span = Math.max(1, bottom - top);
    const at = (ratio) => rows[Math.min(127, top + Math.round(span * ratio))] || 1;
    const width = (at(0.2) + at(0.5)) / 2;
    const weight = Math.round(Math.max(45, Math.min(130, 46 + (width / 64) * 78)));
    const height = Math.round(Math.max(155, Math.min(195, 148 + (span / Math.max(width, 1)) * 14)));
    return { height, weight };
  } catch (_error) {
    return null;
  }
}

function lockUi(button) {
  state.busy = true;
  document.body.classList.add("is-busy");
  if (!button) return;
  button.disabled = true;
  button.classList.add("is-busy");
  if (button.classList.contains("btn")) button.textContent = "Yuklanmoqda…";
}

function unlockUi() {
  state.busy = false;
  document.body.classList.remove("is-busy");
}

function ring(percent, label) {
  const value = Number.isFinite(percent) ? percent : 0;
  return `<div class="ring" style="--p:${value}"><span><b>${value}%</b><small>${esc(label)}</small></span></div>`;
}

function outfitCard(outfit, compact) {
  const ids = outfit.items.map((item) => item.id).join(",");
  const photos = outfit.items.map((item) => `<figure>${photo(item)}<figcaption>${esc(item.name)}</figcaption></figure>`).join("");
  return `<article class="card">
    <div class="spread">
      <div><p class="kicker">${esc(outfit.title)}</p><p>${esc(outfit.reason)}</p></div>
      <div class="score">${outfit.score}</div>
    </div>
    <div class="look">${photos}</div>
    ${compact ? "" : `<button class="btn primary" data-action="save-look" data-ids="${ids}" data-occasion="${esc(outfit.occasion || state.today?.occasion || "kundalik")}">Shu obrazni bugunga yozish</button>`}
  </article>`;
}

function visibleItems() {
  const query = state.q.trim().toLowerCase();
  return items.filter((item) => {
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.forgottenOnly && !item.forgotten) return false;
    if (!query) return true;
    const blob = `${item.name} ${item.color_name} ${item.subtype} ${item.category_label}`.toLowerCase();
    return blob.includes(query);
  });
}

function clothCard(item) {
  const forgotten = item.forgotten ? `<span class="badge">Unutilgan</span>` : "";
  return `<button class="cloth" data-action="open-item" data-id="${item.id}">
    <div class="cloth-photo">${photo(item)}</div>
    <b>${esc(item.name)}</b>
    <span class="fine"><i class="swatch" style="background:${esc(item.color_hex)}"></i>${esc(item.color_name)} · ${esc(item.category_label)}</span>
    <div class="fine">${item.wear_count ? `${item.wear_count} marta` : "Hali kiyilmagan"} ${forgotten}</div>
  </button>`;
}

const SKIN_DOTS = ["#f3d3bf", "#e7b892", "#c68642", "#8d5524", "#5c3317", "#3b2214"];

function circleGlyph(kind) {
  const paths = {
    short: `<path d="M16 28c0-8 6-14 16-14s16 6 16 14v2H16z" fill="currentColor"/>`,
    medium: `<path d="M14 30c1-12 8-18 18-18s17 6 18 18c-4 2-8-4-18-4s-14 6-18 4z" fill="currentColor"/>`,
    long: `<path d="M16 18c0-6 6-10 16-10s16 4 16 10c2 8-2 20-6 24h-4c2-6 2-12 0-16-4 2-8 2-12 0-2 4-2 10 0 16h-4c-4-4-8-16-6-24z" fill="currentColor"/>`,
    bun: `<circle cx="32" cy="16" r="6" fill="currentColor"/><path d="M16 30c0-8 6-12 16-12s16 4 16 12v2H16z" fill="currentColor"/>`,
    face: `<circle cx="32" cy="28" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="27" cy="26" r="1.4" fill="currentColor"/><circle cx="37" cy="26" r="1.4" fill="currentColor"/>`,
    none: `<path d="M18 18l28 28M46 18L18 46" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    round: `<circle cx="24" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="40" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M31 32h2" stroke="currentColor" stroke-width="2"/>`,
    square: `<rect x="16" y="25" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="35" y="25" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/>`,
    sun: `<circle cx="24" cy="32" r="7" fill="currentColor"/><circle cx="40" cy="32" r="7" fill="currentColor"/><path d="M31 32h2" stroke="currentColor" stroke-width="2"/>`,
    plus: `<path d="M32 20v24M20 32h24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${paths[kind] || paths.plus}</svg>`;
}

function circleChoice(action, key, label, glyph, on, extra = "") {
  return `<button type="button" class="circle-pick${on ? " on" : ""}" data-action="${action}" ${extra}><span class="circle-cell">${circleGlyph(glyph)}</span><span class="circle-label">${label}</span></button>`;
}

function railCards(slot, categories) {
  const fit = ensureFitState();
  const list = items.filter((item) => categories.includes(item.category));
  const upload = slot === "shoes" ? "" : `<label class="circle-pick"><span class="circle-cell">${circleGlyph("plus")}<input id="${slot === "top" ? "fit-garment-top" : "fit-garment-bottom"}" hidden type="file" accept="image/*"></span><span class="circle-label">Rasm</span></label>`;
  const add = `<button type="button" class="circle-pick" data-action="nav" data-view="add"><span class="circle-cell">${circleGlyph("plus")}</span><span class="circle-label">Qo'shish</span></button>`;
  const cards = list.map((item) => `<button type="button" class="circle-pick rail-card${String(item.id) === String(fit[slot]) ? " on" : ""}" data-action="wear" data-slot="${slot}" data-id="${item.id}" aria-label="${esc(item.name)}"><span class="circle-cell circle-photo">${photo(item)}</span><span class="circle-label">${esc(item.name)}</span></button>`).join("");
  return `<div class="rail circle-rail" data-slot="${slot}">${add}${upload}${cards || ""}</div>`;
}

function dockHTML() {
  const fit = ensureFitState();
  const look = state.dockTab === "look";
  const hair = [
    ["short", "Kalta", "short"],
    ["medium", "O'rta", "medium"],
    ["long", "Uzun", "long"],
    ["bun", "Yig'ilgan", "bun"],
  ].map(([key, label, glyph]) => circleChoice("set-hair", key, label, glyph, fit.hair === key, `data-hair="${key}"`)).join("");
  const colors = [["#1a120e", "Qora"], ["#6b3e26", "Jigarrang"], ["#c6a15b", "Malla"], ["#8d3b2a", "Qizil"], ["#d7d2cb", "Oq"]].map(([color, label]) => `<button type="button" class="circle-pick${fit.hairColor === color ? " on" : ""}" data-action="set-hair-color" data-color="${color}"><span class="circle-cell swatch-cell" style="--dot:${color}"></span><span class="circle-label">${label}</span></button>`).join("");
  const glasses = [["none", "Yo'q", "none"], ["round", "Dumaloq", "round"], ["square", "To'rtburchak", "square"], ["sun", "Quyosh", "sun"]].map(([key, label, glyph]) => circleChoice("set-glasses", key, label, glyph, (fit.glasses || "none") === key, `data-glasses="${key}"`)).join("");
  const skins = SKIN_DOTS.map((color, index) => `<button type="button" class="circle-pick${Number(fit.skin) === index && !fit.skinHex ? " on" : ""}" data-action="set-skin" data-skin="${index}"><span class="circle-cell swatch-cell" style="--dot:${color}"></span><span class="circle-label">${index + 1}</span></button>`).join("");
  const poses = [["rest", "Tinch"], ["wave", "Salom"], ["walk", "Yurish"], ["sit", "O'tirish"]].map(([key, label]) => `<button type="button" class="chip${fit.pose === key ? " on" : ""}" data-action="set-pose" data-pose="${key}">${label}</button>`).join("");
  const lookCats = [["hair", "Soch"], ["face", "Yuz"], ["glasses", "Ko'zoynak"], ["skin", "Teri"]].map(([key, label]) => `<button type="button" class="galaxy-cat${state.lookRail === key ? " on" : ""}" data-action="set-look" data-look="${key}">${label}</button>`).join("");
  const styleCats = [["top", "Ustki"], ["bottom", "Shim"], ["shoes", "Poyabzal"]].map(([key, label]) => `<button type="button" class="galaxy-cat${state.styleRail === key ? " on" : ""}" data-action="show-rail" data-rail="${key}">${label}</button>`).join("");
  return `<div class="galaxy-tabs">
      <button type="button" class="galaxy-tab${look ? " on" : ""}" data-action="set-dock" data-dock="look">Ko'rinish</button>
      <button type="button" class="galaxy-tab${look ? "" : " on"}" data-action="set-dock" data-dock="style">Uslub</button>
    </div>
    <div class="galaxy-pane${look ? "" : " hidden"}" data-pane="look">
      <div class="galaxy-cats">${lookCats}</div>
      <div class="look-pane${state.lookRail === "hair" ? "" : " hidden"}" data-look="hair"><div class="circle-rail">${hair}${colors}</div></div>
      <div class="look-pane${state.lookRail === "face" ? "" : " hidden"}" data-look="face">
        <div class="circle-rail">
          <label class="circle-pick"><span class="circle-cell">${circleGlyph("face")}<input id="fit-face" hidden type="file" accept="image/*" capture="user"></span><span class="circle-label">Yuz rasmi</span></label>
          <label class="circle-pick"><span class="circle-cell">${circleGlyph("face")}<input id="fit-avatar" hidden type="file" accept="image/*" multiple></span><span class="circle-label">Avatar</span></label>
          <label class="circle-pick"><span class="circle-cell">${circleGlyph("plus")}<input id="fit-body-photo" hidden type="file" accept="image/*"></span><span class="circle-label">Tana</span></label>
          <button type="button" class="circle-pick" data-action="open-avatar-agent"><span class="circle-cell">${circleGlyph("face")}</span><span class="circle-label">Agent</span></button>
        </div>
      </div>
      <div class="look-pane${state.lookRail === "glasses" ? "" : " hidden"}" data-look="glasses"><div class="circle-rail">${glasses}</div></div>
      <div class="look-pane${state.lookRail === "skin" ? "" : " hidden"}" data-look="skin"><div class="circle-rail">${skins}</div></div>
    </div>
    <div class="galaxy-pane${look ? " hidden" : ""}" data-pane="style">
      <div class="galaxy-cats">${styleCats}</div>
      <div class="rail-wrap${state.styleRail === "top" ? "" : " hidden"}" data-rail="top">${railCards("top", ["top", "outerwear", "dress"])}</div>
      <div class="rail-wrap${state.styleRail === "bottom" ? "" : " hidden"}" data-rail="bottom">${railCards("bottom", ["bottom"])}</div>
      <div class="rail-wrap${state.styleRail === "shoes" ? "" : " hidden"}" data-rail="shoes">${railCards("shoes", ["shoes"])}</div>
    </div>
    <div class="dock-controls">
      <div class="stage-sliders">
        <label>Bo'y <b id="fit-height-label">${fit.height}</b><input id="fit-height" type="range" min="150" max="200" value="${fit.height}"></label>
        <label>Vazn <b id="fit-weight-label">${fit.weight}</b><input id="fit-weight" type="range" min="40" max="140" value="${fit.weight}"></label>
      </div>
      <div class="hair-row">${poses}<button type="button" class="chip" data-action="download-projections">3D</button></div>
    </div>`;
}

function viewHome() {
  return `<div class="stage">
    <button class="stage-more" data-action="more" type="button" aria-label="Menyu">⋯</button>
    <p id="stage-advice" class="stage-advice"></p>
    <div id="fit-stage" class="fit-stage"><p class="boot">3D xona ochilmoqda…</p></div>
    <div class="stage-dock">${dockHTML()}</div>
  </div>`;
}

function viewWardrobe() {
  if (state.loading && !items.length) return skeleton(4);
  const cats = [{ key: "all", label: "Hammasi" }, ...meta.categories]
    .map((cat) => `<button class="chip${state.category === cat.key ? " on" : ""}" data-action="set-cat" data-cat="${esc(cat.key)}">${esc(cat.label)}</button>`)
    .join("");
  const list = visibleItems();
  const grid = list.length ? list.map(clothCard).join("") : `<p class="muted">Bu filtrda kiyim yo'q.</p>`;
  return `<div class="stack">
    <div class="spread">
      <input id="search" class="field" placeholder="Qidirish: qora, jinsi, palto" value="${esc(state.q)}">
      <button class="btn primary" data-action="nav" data-view="add">Qo'shish</button>
    </div>
    <div class="filters">${cats}<button class="chip${state.forgottenOnly ? " on" : ""}" data-action="toggle-forgotten">Unutilgan</button></div>
    <div class="grid" id="grid">${grid}</div>
  </div>`;
}

function viewAdd() {
  const previews = state.pending.map((row, index) => `<figure><img src="${esc(row.url)}" alt="" loading="lazy" decoding="async"><button class="icon-btn" data-action="remove-pending" data-index="${index}" type="button">×</button></figure>`).join("");
  const seasons = meta.seasons.map((season) => `<label class="check"><input class="add-season" type="checkbox" value="${esc(season.key)}"${season.key === "all" ? " checked" : ""}>${esc(season.label)}</label>`).join("");
  return `<form class="stack" id="add-form">
    <div class="drop">
      <h2>Bir nechta rasm</h2>
      <p class="note">Galereya yoki kameradan birdaniga tanlang. Oq va bir xil fon olib tashlanadi. Kutubxona cheksiz — bir safarda 40 tagacha.</p>
      <div class="row" style="justify-content:center">
        <label class="btn primary">Galereya<input id="file-input" hidden type="file" accept="image/*" multiple></label>
        <label class="btn">Kamera<input id="camera-input" hidden type="file" accept="image/*" capture="environment" multiple></label>
      </div>
    </div>
    ${previews ? `<div class="pending">${previews}</div>` : ""}
    <div class="form-grid">
      <label class="lbl">Turkum<select id="add-cat" class="field">${optionTags(meta.categories, state.addCategory)}</select></label>
      <label class="lbl">Turi<select id="add-sub" class="field">${subtypeOptions(state.addCategory, state.addSubtype)}</select></label>
      <div class="checks">${seasons}</div>
      ${meta.storage === "cloudinary" ? `<p class="note">Rasmlar Cloudinary bulutida saqlanadi. Telefondan ham shu havola bilan ochiladi.</p>` : ""}
      ${meta.bg_removal === "fast" ? `<p class="note">Fon tez usulda tozalanadi. Murakkab fon uchun: pip install rembg</p>` : `<p class="note">rembg yoqilgan — fon aniqroq olib tashlanadi.</p>`}
      <button class="btn primary" type="submit" ${state.pending.length ? "" : "disabled"}>Garderobga saqlash</button>
    </div>
  </form>`;
}

function viewStylist() {
  const chips = ["Bugun nima kiyaman?", "Ishga qanday obraz?", "Yomg'ir yog'sa-chi?", "Kechki uchrashuv"].map((text) => `<button class="chip" type="button" data-action="chip-chat" data-text="${esc(text)}">${esc(text)}</button>`).join("");
  const messages = state.loading && !state.history.length ? skeleton(2) : state.history.length ? state.history.map((message) => {
    const outfits = message.role === "assistant" && message.payload?.outfits
      ? message.payload.outfits.map((outfit) => outfitCard(outfit, false)).join("")
      : "";
    return `<div class="bubble ${message.role === "user" ? "user" : "assistant"}">${esc(message.content)}</div>${outfits}`;
  }).join("") : `<article class="card"><h2>Stilist tayyor</h2><p class="note">Garderob, ob-havo, vaziyat va profilingizdagi bo'y, vazn, yosh hisobga olinadi. Obuna shart emas.</p></article>`;
  return `<div class="stack">
    <div class="filters">${chips}</div>
    <div class="thread" id="thread">${messages}</div>
    <form class="composer" id="chat-form">
      <input class="field" name="message" placeholder="Masalan: 12 daraja, ofisga boraman" autocomplete="off">
      <button class="btn primary" type="submit">Yuborish</button>
    </form>
    ${state.history.length ? `<button class="btn ghost" data-action="clear-chat" type="button">Suhbatni tozalash</button>` : ""}
  </div>`;
}

function viewCalendar() {
  const [year, month] = state.month.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells = WEEK.map((name) => `<div class="dow">${name}</div>`).join("");
  let grid = "";
  for (let i = 0; i < pad; i += 1) grid += `<div class="day empty"></div>`;
  for (let day = 1; day <= days; day += 1) {
    const iso = `${state.month}-${String(day).padStart(2, "0")}`;
    const on = iso === state.selectedDate ? " on" : "";
    const today = iso === localISO() ? " today" : "";
    const dot = state.calendar[iso] ? `<i class="dot"></i>` : "";
    grid += `<button class="day${on}${today}" data-action="pick-day" data-date="${iso}"><small>${day}</small>${dot}</button>`;
  }
  const entry = state.calendar[state.selectedDate];
  const selected = new Set(entry ? entry.item_ids : []);
  const groups = meta.categories.map((cat) => {
    const group = items.filter((item) => item.category === cat.key);
    if (!group.length) return "";
    const chips = group.map((item) => `<button type="button" class="chip pick${selected.has(item.id) ? " on" : ""}" data-action="toggle-pick" data-id="${item.id}">${esc(item.name)}</button>`).join("");
    return `<div><p class="fine">${esc(cat.label)}</p><div class="picks">${chips}</div></div>`;
  }).join("");
  const thumbs = entry ? `<div class="look">${entry.items.map((item) => `<figure>${photo(item)}<figcaption>${esc(item.name)}</figcaption></figure>`).join("")}</div>` : `<p class="note">Bu kunga hali obraz yozilmagan.</p>`;
  return `<div class="stack">
    <div class="spread">
      <button class="icon-btn" data-action="shift-month" data-delta="-1">‹</button>
      <h2>${monthLabel(state.month)}</h2>
      <button class="icon-btn" data-action="shift-month" data-delta="1">›</button>
    </div>
    <div class="calendar">${cells}${grid}</div>
    <article class="card stack">
      <div class="spread"><h3>${state.selectedDate}</h3><span class="fine">${esc(entry?.occasion_label || "")}</span></div>
      ${thumbs}
      <label class="lbl">Vaziyat<select id="day-occ" class="field">${optionTags(meta.occasions, entry?.occasion || "kundalik")}</select></label>
      <input id="day-note" class="field" placeholder="Izoh" value="${esc(entry?.note || "")}">
      ${groups || `<p class="note">Avval garderobga kiyim qo'shing.</p>`}
      <div class="row">
        <button class="btn primary" data-action="save-day">Shu kunni saqlash</button>
        <button class="btn ghost" data-action="clear-day">Tozalash</button>
      </div>
    </article>
  </div>`;
}

function viewShop() {
  const advice = state.shop;
  let result = "";
  if (advice) {
    const duplicate = advice.duplicate ? `<article class="card"><p class="kicker">Eng o'xshashi · ${advice.duplicate.percent}%</p><div class="look"><figure>${photo(advice.duplicate.item)}<figcaption>${esc(advice.duplicate.item.name)}</figcaption></figure></div></article>` : "";
    const pairs = (advice.pairings || []).map((pair) => `<article class="card"><div class="spread"><b>${pair.percent}%</b><span>${esc(pair.item.name)}</span></div><p>${esc(pair.why)}</p></article>`).join("");
    result = `<section class="card stack">
      <div class="spread">${ring(advice.headline_percent, advice.headline_label)}<div><h2>${esc(advice.title)}</h2><p>${esc(advice.summary)}</p></div></div>
      <img src="${esc(advice.image_url)}" alt="Do'kon rasmi" loading="lazy" decoding="async" style="height:220px;object-fit:contain;background:#efe6d8;border-radius:18px">
      <div class="form-grid">
        <label class="lbl">Turkum<select id="shop-cat" class="field">${optionTags(meta.categories, advice.category, "Bilmayman")}</select></label>
        <label class="lbl">Turi<select id="shop-sub" class="field">${subtypeOptions(advice.category || "top", advice.subtype)}</select></label>
        <label class="lbl">Nom<input id="shop-name" class="field" value="${esc(advice.suggested_name)}"></label>
      </div>
      <div class="row">
        <button class="btn ghost" data-action="shop-recheck" type="button">Qayta hisoblash</button>
        <button class="btn primary" data-action="shop-keep" type="button">Garderobga qo'shish</button>
      </div>
    </section>${duplicate}${pairs}`;
  }
  return `<div class="stack"><form id="shop-form" class="stack">
    <article class="card stack">
      <h2>Olsam bo'ladimi?</h2>
      <p class="note">Do'konda yoqqan kiyimni suratga oling. Ilova garderobingiz bilan solishtirib, o'xshash narsa bor-yo'qligini va qaysi kiyimingizga mosligini foizda aytadi.</p>
      <label class="lbl">Agar turini bilsangiz<select id="shop-cat-form" class="field">${optionTags(meta.categories, state.shopCategory, "Hali bilmayman")}</select></label>
      <label class="lbl">Turi<select id="shop-sub-form" class="field">${subtypeOptions(state.shopCategory || "top", state.shopSubtype)}</select></label>
      <input id="shop-file" class="field" type="file" accept="image/*" capture="environment">
      <button class="btn primary" type="submit">Baholash</button>
    </article>
  </form>
  ${result}
  </div>`;
}

function viewStats() {
  const stats = state.stats;
  if (!stats) return skeleton(3);
  const max = Math.max(...stats.by_category.map((row) => row.count), 1);
  const bars = stats.by_category.map((row) => `<div><div class="spread"><span>${esc(row.label)}</span><b>${row.count}</b></div><div class="bar"><i style="width:${(row.count / max) * 100}%"></i></div></div>`).join("");
  const colors = stats.by_color.map((row) => `<span class="chip">${esc(row.name)} · ${row.count}</span>`).join("");
  const forgotten = stats.forgotten.length ? stats.forgotten.map(clothCard).join("") : `<p class="note">Hozircha unutilgan kiyim yo'q. ${stats.forgotten_days} kundan beri kiyilmaganlari shu yerda chiqadi.</p>`;
  const most = stats.most_worn.length ? stats.most_worn.map((item) => `<div class="spread"><span>${esc(item.name)}</span><b>${item.wear_count}</b></div>`).join("") : `<p class="note">Taqvimga yozsangiz, eng ko'p kiyilganlar chiqadi.</p>`;
  return `<div class="stack">
    <div class="grid">
      <article class="card"><div class="stat-num">${stats.total}</div><p class="muted">Kiyim</p></article>
      <article class="card"><div class="stat-num">${stats.never_worn}</div><p class="muted">Hali kiyilmagan</p></article>
      <article class="card"><div class="stat-num">${stats.logged_days}</div><p class="muted">Yozilgan kun</p></article>
      <article class="card"><div class="stat-num">${stats.forgotten.length}</div><p class="muted">Unutilgan</p></article>
    </div>
    <article class="card stack"><h2>Turkumlar</h2>${bars || `<p class="note">Hali kiyim yo'q.</p>`}</article>
    <article class="card stack"><h2>Ranglar</h2><div class="filters">${colors || `<p class="note">Ranglar rasm qo'shilganda chiqadi.</p>`}</div></article>
    <article class="card stack"><h2>Ko'p kiyilgan</h2>${most}</article>
    <div><h2>Unutilganlar</h2><div class="grid">${forgotten}</div></div>
  </div>`;
}

function viewProfile() {
  return `<form id="profile-form" class="stack card">
    <p class="note">Bu ma'lumot faqat shu kompyuterdagi bazada turadi. Stilist bo'y, vazn va yoshni uslubiy maslahat uchun ishlatadi — bu tibbiy xulosa emas.</p>
    <label class="lbl">Ism<input id="p-name" class="field" value="${esc(profile.name)}"></label>
    <label class="lbl">Shahar<input id="p-city" class="field" value="${esc(profile.city)}"></label>
    <div class="form-grid thirds">
      <label class="lbl">Bo'y, sm<input id="p-height" class="field" type="number" min="80" max="250" value="${profile.height_cm ?? ""}"></label>
      <label class="lbl">Vazn, kg<input id="p-weight" class="field" type="number" min="20" max="400" value="${profile.weight_kg ?? ""}"></label>
      <label class="lbl">Yosh<input id="p-age" class="field" type="number" min="1" max="120" value="${profile.age ?? ""}"></label>
    </div>
    <label class="lbl">Uslub<select id="p-style" class="field">${optionTags(meta.styles, profile.style)}</select></label>
    <label class="lbl">Nima yoqadi, nima yoqmaydi<textarea id="p-pref" class="field" placeholder="Qora va bej yoqadi. Qizilni kam kiyman.">${esc(profile.preferences)}</textarea></label>
    <button class="btn primary" type="submit">Saqlash</button>
    <p class="note">API hujjatlari: <a href="/docs" style="color:var(--gold)">/docs</a></p>
  </form>`;
}

function bodyWord(value) {
  if (value < 34) return "ozg'in";
  if (value < 67) return "o'rtacha";
  return "keng";
}

function clothChoices(categories, selected) {
  const rows = [`<option value="">Tanlanmagan</option>`];
  for (const item of items) {
    if (!categories.includes(item.category)) continue;
    rows.push(`<option value="${item.id}"${String(item.id) === String(selected) ? " selected" : ""}>${esc(item.name)}</option>`);
  }
  return rows.join("");
}

function ensureFitState() {
  if (!state.fit) {
    state.fit = {
      height: Math.round(profile?.height_cm || 170),
      weight: Math.round(profile?.weight_kg || 70),
      skin: 2,
      face: "",
      hair: "short",
      hairColor: "#1a120e",
      fromBody: false,
      top: "",
      bottom: "",
      shoes: "",
      pose: "rest",
      glasses: "none",
      drapeTop: "",
      drapeBottom: "",
      shoulder: 1,
      hips: 1,
      skinHex: "",
      fromAvatar: false,
    };
  }
  state.fit.hair = state.fit.hair || "short";
  state.fit.hairColor = state.fit.hairColor || "#1a120e";
  state.fit.pose = state.fit.pose || "rest";
  state.fit.glasses = state.fit.glasses || "none";
  state.fit.drapeTop = state.fit.drapeTop || "";
  state.fit.drapeBottom = state.fit.drapeBottom || "";
  if (!state.fit.shoulder) state.fit.shoulder = 1;
  if (!state.fit.hips) state.fit.hips = 1;
  if (!state.fit.skinHex) state.fit.skinHex = "";
  return state.fit;
}

function stageAdvice() {
  const fit = ensureFitState();
  const top = items.find((item) => String(item.id) === String(fit.top));
  const bottom = items.find((item) => String(item.id) === String(fit.bottom));
  const shoe = items.find((item) => String(item.id) === String(fit.shoes));
  const hairName = { short: "kalta soch", medium: "o'rta soch", long: "uzun soch", bun: "yig'ilgan soch" }[fit.hair] || "soch";
  const glassName = { round: "dumaloq ko'zoynak", square: "to'rtburchak ko'zoynak", sun: "quyosh ko'zoynagi" }[fit.glasses] || "";
  const bits = [];
  if (fit.fromAvatar) bits.push(fit.agentNote || `Avatar rasmingdan teri va qomat olindi: taxminan ${fit.height} sm, ${fit.weight} kg.`);
  else if (fit.fromBody) bits.push(`Tana rasming bo'yicha maket taxminan ${fit.height} sm va ${fit.weight} kg ga yaqinlashtirildi.`);
  if (!top && !bottom && !shoe) {
    bits.push("Uslubdagi doiradan kiyimni bos — u avatarga darhol kiydiriladi.");
    return bits.join(" ");
  }
  if (top) bits.push(`${top.name} senga juda mos tushadi.`);
  if (bottom) bits.push(`${bottom.name} tana chizig'ini yaxshi ushlaydi.`);
  if (shoe && top) bits.push(`${shoe.name} bilan bu obraz mukammal chiqadi.`);
  else if (!shoe) bits.push("Oyoq kiyim qo'shsang, obraz yanada to'liq chiqadi.");
  if (top) bits.push(`${hairName[0].toUpperCase()}${hairName.slice(1)} bilan bu ustki kiyim bir-biriga tushadi.`);
  if (glassName && top) bits.push(`${glassName[0].toUpperCase()}${glassName.slice(1)} bu obrazni yengil qiladi.`);
  return bits.join(" ");
}

function paintAdvice() {
  const node = document.getElementById("stage-advice");
  if (node) node.textContent = stageAdvice();
}

function fitPayload() {
  const fit = ensureFitState();
  const top = items.find((item) => String(item.id) === String(fit.top));
  const bottom = items.find((item) => String(item.id) === String(fit.bottom));
  const shoe = items.find((item) => String(item.id) === String(fit.shoes));
  const weight = Number(fit.weight) || 70;
  return {
    height: fit.height,
    weight,
    body: Math.round(Math.max(0, Math.min(100, ((weight - 45) / 90) * 100))),
    skin: fit.skin,
    skinHex: fit.skinHex || "",
    shoulder: fit.shoulder || 1,
    hips: fit.hips || 1,
    faceUrl: fit.face || "",
    hair: fit.hair,
    hairColor: fit.hairColor,
    pose: fit.pose || "rest",
    glasses: fit.glasses || "none",
    topUrl: fit.drapeTop || top?.image_url || "",
    bottomUrl: fit.drapeBottom || bottom?.image_url || "",
    shoeUrl: shoe?.image_url || "",
    dress: top?.category === "dress",
  };
}

const views = {
  home: viewHome,
  wardrobe: viewWardrobe,
  add: viewAdd,
  stylist: viewStylist,
  calendar: viewCalendar,
  shop: viewShop,
  stats: viewStats,
  profile: viewProfile,
};

function sideHTML() {
  const links = [
    ["home", "3D xona"],
    ["wardrobe", "Garderob"],
    ["add", "Qo'shish"],
    ["stylist", "Stilist"],
    ["calendar", "Taqvim"],
    ["shop", "Xarid"],
    ["stats", "Statistika"],
    ["profile", "Profil"],
  ].map(([view, label]) => `<button class="side-btn${state.view === view ? " active" : ""}" data-action="nav" data-view="${view}" data-nav="${view}">${label}</button>`).join("");
  return `<div class="brand"><div class="mark">G</div><div><strong>Garderob</strong><div class="fine">${esc(profile?.name || "Kio")} · ${items.length} kiyim</div></div></div>${links}`;
}

function tabHTML() {
  const tabs = [["home", "3D", "◎"], ["wardrobe", "Kiyim", "▣"], ["stylist", "Stilist", "✎"], ["calendar", "Taqvim", "▦"], ["more", "Yana", "⋯"]];
  return tabs.map(([view, label, icon]) => `<button class="nav-btn${tabFor(state.view) === view ? " active" : ""}" data-action="${view === "more" ? "more" : "nav"}" data-view="${view}" data-nav="${view}"><strong>${icon}</strong>${label}</button>`).join("");
}

function renderShell() {
  document.getElementById("side").innerHTML = sideHTML();
  document.getElementById("tabbar").innerHTML = tabHTML();
}

let fitApi = null;
let fitToken = 0;

function stopFit() {
  fitToken += 1;
  if (!fitApi) return;
  fitApi.dispose();
  fitApi = null;
}

async function startFit() {
  const token = ++fitToken;
  const stage = document.getElementById("fit-stage");
  if (!stage) return;
  if (fitApi) {
    fitApi.dispose();
    fitApi = null;
  }
  try {
    const room = await import("/assets/fit.js");
    if (token !== fitToken || state.view !== "home") return;
    const live = document.getElementById("fit-stage");
    if (!live) return;
    live.textContent = "";
    fitApi = room.mount(live, fitPayload());
  } catch (error) {
    if (token !== fitToken) return;
    const live = document.getElementById("fit-stage");
    if (live) live.innerHTML = `<p class="boot">3D maket ochilmadi. Internetni tekshiring.</p>`;
    toast(error.message || "3D maket ochilmadi");
  }
}

function syncFit() {
  const fit = ensureFitState();
  const height = document.getElementById("fit-height");
  const weight = document.getElementById("fit-weight");
  const skin = document.getElementById("fit-skin");
  if (height) fit.height = Number(height.value);
  if (weight) fit.weight = Number(weight.value);
  if (skin) fit.skin = Number(skin.value);
  const heightLabel = document.getElementById("fit-height-label");
  const weightLabel = document.getElementById("fit-weight-label");
  if (heightLabel) heightLabel.textContent = String(fit.height);
  if (weightLabel) weightLabel.textContent = String(fit.weight);
  fitApi?.update(fitPayload());
  paintAdvice();
}

function bindRails() {
  document.querySelectorAll(".rail").forEach((rail) => {
    if (rail.dataset.bound) return;
    rail.dataset.bound = "1";
    let timer = 0;
    rail.addEventListener("scroll", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cards = [...rail.querySelectorAll(".rail-card")];
        if (!cards.length) return;
        const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
        let best = cards[0];
        let dist = Infinity;
        for (const card of cards) {
          const box = card.getBoundingClientRect();
          const gap = Math.abs(box.left + box.width / 2 - mid);
          if (gap < dist) {
            dist = gap;
            best = card;
          }
        }
        const fit = ensureFitState();
        if (String(fit[best.dataset.slot]) === String(best.dataset.id)) return;
        fit[best.dataset.slot] = best.dataset.id;
        rail.querySelectorAll(".rail-card").forEach((card) => card.classList.toggle("on", card === best));
        fitApi?.update(fitPayload());
        paintAdvice();
      }, 90);
    }, { passive: true });
  });
}

function render() {
  document.body.classList.toggle("on-stage", state.view === "home");
  if (state.view !== "home") stopFit();
  const keepStage = state.view === "home" && document.querySelector("#fit-stage canvas");
  if (keepStage) {
    const dock = document.querySelector(".stage-dock");
    if (dock) dock.innerHTML = dockHTML();
    renderShell();
    bindRails();
    fitApi?.update(fitPayload());
    paintAdvice();
    return;
  }
  const [kicker, title] = TITLES[state.view] || ["", ""];
  document.getElementById("topbar").innerHTML = `<div><p class="kicker">${kicker}</p><h1>${title}</h1></div>`;
  document.getElementById("view").innerHTML = views[state.view]();
  renderShell();
  const thread = document.getElementById("thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  if (state.view === "home") {
    startFit();
    bindRails();
    paintAdvice();
  }
}

async function go(view) {
  state.view = view;
  localStorage.setItem("garderob-view", view);
  const cold = (view === "stats" && !state.stats) || (view === "stylist" && !state.historyLoaded && !state.history.length);
  if (cold) {
    state.loading = true;
    render();
  }
  try {
    if (view === "stats") state.stats = await api("/api/stats");
    if (view === "calendar") await loadCalendar();
    if (view === "stylist" && !state.historyLoaded) {
      state.history = await api("/api/stylist/history");
      state.historyLoaded = true;
    }
  } finally {
    state.loading = false;
    render();
    saveSnapshot();
  }
}

async function loadCalendar() {
  const data = await api(`/api/calendar?month=${state.month}`);
  for (const key of Object.keys(state.calendar)) {
    if (key.startsWith(state.month)) delete state.calendar[key];
  }
  for (const day of data.days) state.calendar[day.date] = day;
}

function findItem(id) {
  return items.find((item) => item.id === Number(id));
}

function openItem(id) {
  const item = findItem(id);
  if (!item) return;
  const colors = meta.colors.some((color) => color.name === item.color_name)
    ? meta.colors
    : [{ name: item.color_name, hex: item.color_hex }, ...meta.colors];
  const seasons = meta.seasons.map((season) => `<label class="check"><input class="edit-season" type="checkbox" value="${esc(season.key)}"${item.seasons.includes(season.key) ? " checked" : ""}>${esc(season.label)}</label>`).join("");
  openModal(`<div class="stack">
    <div class="spread"><h2>${esc(item.name)}</h2><button class="icon-btn" data-action="close-modal">×</button></div>
    <div class="cloth-photo">${photo(item, true)}</div>
    <label class="lbl">Nom<input id="edit-name" class="field" value="${esc(item.name)}"></label>
    <label class="lbl">Turkum<select id="edit-cat" class="field">${optionTags(meta.categories, item.category)}</select></label>
    <label class="lbl">Turi<select id="edit-sub" class="field">${subtypeOptions(item.category, item.subtype)}</select></label>
    <label class="lbl">Rang<select id="edit-color" class="field">${optionTags(colors.map((color) => ({ key: color.name, label: color.name })), item.color_name)}</select></label>
    <div class="checks">${seasons}</div>
    <label class="lbl">Izoh<textarea id="edit-notes" class="field">${esc(item.notes)}</textarea></label>
    <p class="fine">${item.wear_count} marta kiyilgan${item.last_worn_on ? ` · oxiri ${esc(item.last_worn_on)}` : ""}</p>
    <div class="row">
      <button class="btn primary" data-action="save-item" data-id="${item.id}">Saqlash</button>
      <button class="btn" data-action="wear-item" data-id="${item.id}">Bugun kiyildi</button>
      <button class="btn danger" data-action="delete-item" data-id="${item.id}">O'chirish</button>
    </div>
  </div>`);
}

function checkedValues(selector) {
  return [...document.querySelectorAll(selector)].filter((node) => node.checked).map((node) => node.value);
}

function numberOrNull(id) {
  const value = document.getElementById(id).value.trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function refreshItems() {
  items = await api("/api/items");
  saveSnapshot();
}

async function saveItem(id) {
  const seasons = checkedValues(".edit-season");
  const updated = await api(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("edit-name").value,
      category: document.getElementById("edit-cat").value,
      subtype: document.getElementById("edit-sub").value,
      color_name: document.getElementById("edit-color").value,
      seasons: seasons.length ? seasons : ["all"],
      notes: document.getElementById("edit-notes").value,
    }),
  });
  items = items.map((item) => (item.id === updated.id ? updated : item));
  closeModal();
  toast("Saqlandi");
  render();
}

async function saveLook(button) {
  const ids = button.dataset.ids.split(",").filter(Boolean).map(Number);
  await api("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worn_on: localISO(), item_ids: ids, occasion: button.dataset.occasion || "kundalik", note: "" }),
  });
  await refreshItems();
  toast("Bugungi taqvimga yozildi");
  render();
}

async function sendChat(text) {
  const message = (text || "").trim();
  if (!message) return;
  state.history.push({ role: "user", content: message, payload: null });
  state.historyLoaded = true;
  render();
  const body = await api("/api/stylist/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  state.history.push({ role: "assistant", content: body.reply, payload: body });
  render();
}

async function saveDay(clear) {
  const ids = clear ? [] : [...document.querySelectorAll(".pick.on")].map((node) => Number(node.dataset.id));
  const saved = await api("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      worn_on: state.selectedDate,
      item_ids: ids,
      occasion: document.getElementById("day-occ")?.value || "kundalik",
      note: document.getElementById("day-note")?.value || "",
    }),
  });
  if (saved.item_ids?.length) state.calendar[saved.date] = saved;
  else delete state.calendar[state.selectedDate];
  await refreshItems();
  toast(clear || !ids.length ? "Kun tozalandi" : "Kun saqlandi");
  render();
}

async function boot() {
  state.month = localISO().slice(0, 7);
  state.selectedDate = localISO();
  const cached = await idbGet("snapshot");
  if (cached?.meta && cached.profile) {
    meta = cached.meta;
    profile = cached.profile;
    items = cached.items || [];
    state.today = cached.today || null;
    state.history = cached.history || [];
    state.historyLoaded = state.history.length > 0;
    renderShell();
    render();
  }
  [meta, profile, items] = await Promise.all([api("/api/meta"), api("/api/profile"), api("/api/items")]);
  await go("home");
}

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || state.busy) return;
  const action = button.dataset.action;
  const instant = new Set(["more", "close-modal", "open-item", "set-cat", "toggle-forgotten", "remove-pending", "pick-day", "toggle-pick", "wear", "show-rail", "set-hair", "set-hair-color", "set-pose", "set-dock", "set-look", "set-glasses", "set-skin"]);
  if (!instant.has(action)) lockUi(button);
  try {
    if (action === "nav") {
      closeModal();
      await go(button.dataset.view);
    }
    else if (action === "more") {
      openModal(`<div class="stack">
        <div class="spread"><h2>Yana</h2><button class="icon-btn" data-action="close-modal">×</button></div>
        <button class="btn" data-action="nav" data-view="add">Kiyim qo'shish</button>
        <button class="btn" data-action="nav" data-view="wardrobe">Garderob</button>
        <button class="btn" data-action="nav" data-view="stylist">Stilist</button>
        <button class="btn" data-action="nav" data-view="calendar">Taqvim</button>
        <button class="btn" data-action="nav" data-view="shop">Xarid maslahati</button>
        <button class="btn" data-action="nav" data-view="stats">Statistika</button>
        <button class="btn" data-action="nav" data-view="profile">Profil</button>
      </div>`);
    } else if (action === "close-modal") closeModal();
    else if (action === "set-dock") {
      state.dockTab = button.dataset.dock === "style" ? "style" : "look";
      document.querySelectorAll("[data-action='set-dock']").forEach((node) => node.classList.toggle("on", node.dataset.dock === state.dockTab));
      document.querySelectorAll(".galaxy-pane").forEach((node) => node.classList.toggle("hidden", node.dataset.pane !== state.dockTab));
    } else if (action === "set-look") {
      state.lookRail = button.dataset.look || "hair";
      document.querySelectorAll("[data-action='set-look']").forEach((node) => node.classList.toggle("on", node.dataset.look === state.lookRail));
      document.querySelectorAll(".look-pane").forEach((node) => node.classList.toggle("hidden", node.dataset.look !== state.lookRail));
    } else if (action === "show-rail") {
      state.styleRail = button.dataset.rail || "top";
      document.querySelectorAll(".rail-wrap").forEach((node) => node.classList.toggle("hidden", node.dataset.rail !== state.styleRail));
      document.querySelectorAll("[data-action='show-rail']").forEach((node) => node.classList.toggle("on", node.dataset.rail === state.styleRail));
    } else if (action === "set-skin") {
      const fit = ensureFitState();
      fit.skin = Number(button.dataset.skin);
      fit.skinHex = "";
      document.querySelectorAll("[data-action='set-skin']").forEach((node) => node.classList.toggle("on", node.dataset.skin === button.dataset.skin));
      fitApi?.update(fitPayload());
      paintAdvice();
    } else if (action === "set-glasses") {
      const fit = ensureFitState();
      fit.glasses = button.dataset.glasses || "none";
      document.querySelectorAll("[data-action='set-glasses']").forEach((node) => node.classList.toggle("on", node.dataset.glasses === fit.glasses));
      fitApi?.update(fitPayload());
      paintAdvice();
    } else if (action === "wear") {
      const fit = ensureFitState();
      const slot = button.dataset.slot;
      fit[slot] = String(fit[slot]) === String(button.dataset.id) ? "" : button.dataset.id;
      button.parentElement?.querySelectorAll(".rail-card").forEach((card) => card.classList.toggle("on", String(card.dataset.id) === String(fit[slot])));
      fitApi?.update(fitPayload());
      paintAdvice();
    } else if (action === "set-hair") {
      const fit = ensureFitState();
      fit.hair = button.dataset.hair;
      document.querySelectorAll("[data-action='set-hair']").forEach((node) => node.classList.toggle("on", node.dataset.hair === fit.hair));
      fitApi?.update(fitPayload());
      paintAdvice();
    } else if (action === "open-avatar-agent") {
      openModal(`<div class="stack">
        <p class="kicker">Avatar agent</p>
        <h2>Shu odamga o'xshash 3D</h2>
        <p>Yuz, butun tana yoki yon tomondan rasm yuboring. Agent ko'z chizig'i, teri rangi, soch va qomatni o'qib, tanani shunga yaqinlashtiradi.</p>
        <label class="lbl">Rasmlar<input id="agent-photos" class="field" type="file" accept="image/*" multiple></label>
        <button class="btn primary" type="button" data-action="run-avatar-agent">Avatar yasash</button>
      </div>`);
    } else if (action === "run-avatar-agent") {
      const chosen = document.getElementById("agent-photos")?.files;
      if (!chosen?.length) {
        toast("Kamida bitta rasm tanlang");
        return;
      }
      closeModal();
      await applyAvatarFiles(chosen, "auto");
    } else if (action === "download-projections") {
      if (!fitApi?.projections) {
        toast("3D xona hali ochilmadi");
        return;
      }
      button.disabled = true;
      toast("3D agent proyeksiyalarni chizmoqda…");
      try {
        const frames = await fitApi.projections();
        if (!frames.length) {
          toast("3D tana hali tayyor emas");
          return;
        }
        const files = [];
        for (const frame of frames) files.push({ name: frame.name, data: new Uint8Array(await frame.blob.arrayBuffer()) });
        const zip = zipStore(files);
        const url = URL.createObjectURL(zip);
        const link = document.createElement("a");
        link.href = url;
        link.download = "garderob-3d-proyeksiya.zip";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast("6 ta proyeksiya yuklandi: old, orqa, chap, o'ng, tepa, past");
      } catch (_error) {
        toast("Proyeksiya yuklanmadi");
      } finally {
        button.disabled = false;
      }
    } else if (action === "set-pose") {
      const fit = ensureFitState();
      fit.pose = button.dataset.pose || "rest";
      document.querySelectorAll("[data-action='set-pose']").forEach((node) => node.classList.toggle("on", node.dataset.pose === fit.pose));
      fitApi?.update(fitPayload());
    } else if (action === "set-hair-color") {
      const fit = ensureFitState();
      fit.hairColor = button.dataset.color;
      document.querySelectorAll("[data-action='set-hair-color']").forEach((node) => node.classList.toggle("on", node.dataset.color === fit.hairColor));
      fitApi?.update(fitPayload());
      paintAdvice();
    } else if (action === "open-item") openItem(button.dataset.id);
    else if (action === "save-item") await saveItem(button.dataset.id);
    else if (action === "delete-item") {
      if (!confirm("Bu kiyim o'chirilsinmi?")) return;
      await api(`/api/items/${button.dataset.id}`, { method: "DELETE" });
      await refreshItems();
      closeModal();
      toast("O'chirildi");
      render();
    } else if (action === "wear-item") {
      const today = localISO();
      const month = await api(`/api/calendar?month=${today.slice(0, 7)}`);
      const current = month.days.find((day) => day.date === today);
      const ids = new Set(current?.item_ids || []);
      ids.add(Number(button.dataset.id));
      await api("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worn_on: localISO(), item_ids: [...ids], occasion: "kundalik", note: current?.note || "" }),
      });
      await refreshItems();
      closeModal();
      toast("Bugungi kunga qo'shildi");
      render();
    } else if (action === "save-look") await saveLook(button);
    else if (action === "chip-chat") await sendChat(button.dataset.text);
    else if (action === "clear-chat") {
      await api("/api/stylist/history", { method: "DELETE" });
      state.history = [];
      render();
    } else if (action === "set-cat") {
      state.category = button.dataset.cat;
      render();
    } else if (action === "toggle-forgotten") {
      state.forgottenOnly = !state.forgottenOnly;
      render();
    } else if (action === "remove-pending") {
      const index = Number(button.dataset.index);
      URL.revokeObjectURL(state.pending[index].url);
      state.pending.splice(index, 1);
      render();
    } else if (action === "shift-month") {
      const [year, month] = state.month.split("-").map(Number);
      const next = new Date(year, month - 1 + Number(button.dataset.delta), 1);
      state.month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      await loadCalendar();
      render();
    } else if (action === "pick-day") {
      state.selectedDate = button.dataset.date;
      render();
    } else if (action === "toggle-pick") button.classList.toggle("on");
    else if (action === "save-day") await saveDay(false);
    else if (action === "clear-day") await saveDay(true);
    else if (action === "shop-recheck") {
      state.shop = await api("/api/shop/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temp_id: state.shop.temp_id,
          category: document.getElementById("shop-cat").value,
          subtype: document.getElementById("shop-sub").value,
        }),
      });
      render();
    } else if (action === "shop-keep") {
      const kept = await api("/api/shop/keep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temp_id: state.shop.temp_id,
          name: document.getElementById("shop-name").value,
          category: document.getElementById("shop-cat").value || "other",
          subtype: document.getElementById("shop-sub").value,
          seasons: ["all"],
        }),
      });
      items.unshift(kept);
      state.shop = null;
      toast("Garderobga qo'shildi");
      await go("wardrobe");
    }
  } catch (error) {
    toast(error.message);
  } finally {
    unlockUi();
  }
});

document.body.addEventListener("submit", async (event) => {
  const form = event.target;
  if (state.busy) {
    event.preventDefault();
    return;
  }
  const submit = form.querySelector("[type=submit]");
  lockUi(submit);
  try {
    if (form.id === "chat-form") {
      event.preventDefault();
      const message = new FormData(form).get("message");
      form.reset();
      await sendChat(message);
    } else if (form.id === "add-form") {
      event.preventDefault();
      if (!state.pending.length) return;
      const data = new FormData();
      for (const row of state.pending) data.append("files", await shrinkFile(row.file));
      data.append("category", document.getElementById("add-cat").value);
      data.append("subtype", document.getElementById("add-sub").value);
      const seasons = checkedValues(".add-season");
      data.append("seasons", seasons.length ? seasons.join(",") : "all");
      const result = await api("/api/items/upload", { method: "POST", body: data });
      for (const row of state.pending) URL.revokeObjectURL(row.url);
      state.pending = [];
      await refreshItems();
      toast(`${result.items.length} ta kiyim qo'shildi`);
      if (result.errors?.length) toast(result.errors[0].error);
      await go("wardrobe");
    } else if (form.id === "shop-form") {
      event.preventDefault();
      const picked = document.getElementById("shop-file").files[0];
      if (!picked) {
        toast("Rasm tanlang");
        return;
      }
      const data = new FormData();
      data.append("file", await shrinkFile(picked));
      data.append("category", document.getElementById("shop-cat-form").value);
      data.append("subtype", document.getElementById("shop-sub-form").value);
      state.shopCategory = document.getElementById("shop-cat-form").value;
      state.shopSubtype = document.getElementById("shop-sub-form").value;
      state.shop = await api("/api/shop/check", { method: "POST", body: data });
      render();
    } else if (form.id === "profile-form") {
      event.preventDefault();
      profile = await api("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("p-name").value,
          city: document.getElementById("p-city").value,
          style: document.getElementById("p-style").value,
          preferences: document.getElementById("p-pref").value,
          height_cm: numberOrNull("p-height"),
          weight_kg: numberOrNull("p-weight"),
          age: numberOrNull("p-age") == null ? null : Math.round(numberOrNull("p-age")),
        }),
      });
      toast("Profil saqlandi");
      render();
    }
  } catch (error) {
    toast(error.message);
  } finally {
    unlockUi();
  }
});

document.body.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.id === "file-input" || target.id === "camera-input") {
    const chosen = [...target.files];
    target.value = "";
    for (const file of chosen) {
      if (!file.type.startsWith("image/")) continue;
      const small = await shrinkFile(file);
      state.pending.push({ file: small, url: URL.createObjectURL(small) });
    }
    render();
  } else if (target.id === "add-cat") {
    state.addCategory = target.value;
    state.addSubtype = "";
    render();
  } else if (target.id === "add-sub") {
    state.addSubtype = target.value;
  } else if (target.id === "shop-cat-form") {
    state.shopCategory = target.value;
    state.shopSubtype = "";
    render();
  } else if (target.classList.contains("add-season") && target.value === "all" && target.checked) {
    for (const box of document.querySelectorAll(".add-season")) {
      if (box.value !== "all") box.checked = false;
    }
  } else if (target.classList.contains("edit-season") && target.value === "all" && target.checked) {
    for (const box of document.querySelectorAll(".edit-season")) {
      if (box.value !== "all") box.checked = false;
    }
  } else if (target.id === "edit-cat") {
    const select = document.getElementById("edit-sub");
    select.innerHTML = subtypeOptions(target.value, "");
  } else if (target.id === "fit-avatar" || target.id === "fit-face" || target.id === "fit-body-photo") {
    const chosen = target.files ? [...target.files] : [];
    const hint = target.id === "fit-face" ? "face" : target.id === "fit-body-photo" ? "body" : "auto";
    target.value = "";
    if (chosen.length) await applyAvatarFiles(chosen, hint);
  } else if (target.id === "fit-garment-top" || target.id === "fit-garment-bottom") {
    const file = target.files?.[0];
    target.value = "";
    if (file) {
      try {
        const url = await cutGarment(file);
        const fit = ensureFitState();
        if (target.id === "fit-garment-top") fit.drapeTop = url;
        else fit.drapeBottom = url;
        fitApi?.update(fitPayload());
        toast(target.id === "fit-garment-top" ? "Ustki kiyim tanaga yopishtirildi" : "Shim tanaga yopishtirildi");
      } catch (_error) {
        toast("Kiyim rasmi o'qilmadi");
      }
    }
  } else if (target.id && target.id.startsWith("fit-")) {
    if (target.id === "fit-skin") ensureFitState().skinHex = "";
    syncFit();
  } else if (target.id === "search") {
    state.q = target.value;
    const grid = document.getElementById("grid");
    if (grid) {
      const list = visibleItems();
      grid.innerHTML = list.length ? list.map(clothCard).join("") : `<p class="muted">Bu filtrda kiyim yo'q.</p>`;
    }
  }
});

function tiltCard(card, x, y) {
  const rect = card.getBoundingClientRect();
  const px = (x - rect.left) / rect.width - 0.5;
  const py = (y - rect.top) / rect.height - 0.5;
  card.style.transform = `rotateX(${(-py * 14).toFixed(2)}deg) rotateY(${(px * 16).toFixed(2)}deg) translateZ(8px)`;
}

let tiltTarget = null;
let tiltAllowed = false;

document.body.addEventListener("pointerdown", async (event) => {
  const card = event.target.closest(".cloth");
  if (!card) return;
  tiltTarget = card;
  tiltCard(card, event.clientX, event.clientY);
  if (tiltAllowed) return;
  tiltAllowed = true;
  const orientation = window.DeviceOrientationEvent;
  if (orientation && typeof orientation.requestPermission === "function") {
    try { await orientation.requestPermission(); } catch (_error) { /* ruxsat berilmasa barmoq effekti qoladi */ }
  }
});

document.body.addEventListener("pointermove", (event) => {
  const card = tiltTarget || (event.pointerType !== "touch" ? event.target.closest(".cloth") : null);
  if (!card) return;
  tiltCard(card, event.clientX, event.clientY);
});

function resetTilt() {
  if (!tiltTarget) return;
  tiltTarget.style.transform = "";
  tiltTarget = null;
}

document.body.addEventListener("pointerup", resetTilt);
document.body.addEventListener("pointercancel", resetTilt);
document.body.addEventListener("pointerleave", (event) => {
  if (event.target.classList?.contains("cloth")) event.target.style.transform = "";
});

window.addEventListener("deviceorientation", (event) => {
  if (tiltTarget || !tiltAllowed) return;
  const grid = document.getElementById("grid");
  if (!grid) return;
  const x = Math.max(-10, Math.min(10, (event.gamma || 0) / 4));
  const y = Math.max(-10, Math.min(10, ((event.beta || 40) - 40) / 5));
  for (const card of grid.querySelectorAll(".cloth")) {
    card.style.transform = `rotateX(${(-y).toFixed(2)}deg) rotateY(${x.toFixed(2)}deg) translateZ(6px)`;
  }
});

document.body.addEventListener("input", (event) => {
  if (event.target.id && event.target.id.startsWith("fit-")) {
    syncFit();
    return;
  }
  if (event.target.id === "search") {
    state.q = event.target.value;
    const grid = document.getElementById("grid");
    if (!grid) return;
    const list = visibleItems();
    grid.innerHTML = list.length ? list.map(clothCard).join("") : `<p class="muted">Bu filtrda kiyim yo'q.</p>`;
  }
});

document.getElementById("modal").addEventListener("click", (event) => {
  if (event.target.id === "modal") closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

boot().catch((error) => {
  document.getElementById("view").innerHTML = `<article class="card"><h2>Ochilmadi</h2><p>${esc(error.message)}</p></article>`;
});
