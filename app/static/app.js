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
};

let meta = null;
let profile = null;
let items = [];
let toastTimer = null;

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEK = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];
const TITLES = {
  home: ["Atelye", "Bugun"],
  wardrobe: ["Kutubxona", "Garderob"],
  add: ["Yangi", "Kiyim qo'shish"],
  stylist: ["Maslahat", "AI stilist"],
  calendar: ["Tarix", "Taqvim"],
  shop: ["Do'kon", "Xarid maslahati"],
  stats: ["Hisob", "Statistika"],
  profile: ["Siz", "Profil"],
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
  if (["shop", "stats", "profile"].includes(view)) return "more";
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

function photo(item) {
  return `<img src="${esc(item.image_url)}" alt="${esc(item.name)}">`;
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

function viewHome() {
  const today = state.today;
  if (!today) return `<p class="boot">Yuklanmoqda…</p>`;
  const weather = today.weather || {};
  const temp = weather.temp == null ? "—" : `${Math.round(weather.temp)}°`;
  const outfits = (today.outfits || []).map((outfit, index) => outfitCard(outfit, index > 0)).join("");
  const forgotten = (today.forgotten || []).slice(0, 6).map(clothCard).join("");
  const empty = today.total === 0
    ? `<article class="card stack"><h2>Garderob bo'sh</h2><p>Rasmlarni qo'shing. Fon tozalanadi, rang va tur yoziladi, keyin stilist obraz tuzadi. Kutubxonada cheklov yo'q.</p><button class="btn primary" data-action="nav" data-view="add">Kiyim qo'shish</button></article>`
    : outfits || `<article class="card"><p>${esc(today.reply)}</p></article>`;
  const profileHint = profile.height_cm ? "" : `<button class="btn ghost" data-action="nav" data-view="profile">Bo'y va vaznni kiriting</button>`;
  return `<div class="stack">
    <section class="weather">
      <div><p class="kicker">${esc(weather.city || profile.city || "Shahar")}</p><div class="temp">${temp}</div><p class="muted">${esc(weather.description || "")}</p></div>
      <div>${profileHint}</div>
    </section>
    <p>${esc(today.reply || "")}</p>
    ${empty}
    ${forgotten ? `<div><div class="spread"><h2>Unutilganlar</h2><button class="btn ghost" data-action="nav" data-view="stats">Hammasi</button></div><div class="grid">${forgotten}</div></div>` : ""}
  </div>`;
}

function viewWardrobe() {
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
  const previews = state.pending.map((row, index) => `<figure><img src="${esc(row.url)}" alt=""><button class="icon-btn" data-action="remove-pending" data-index="${index}" type="button">×</button></figure>`).join("");
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
      ${meta.storage === "cloudinary" ? `<p class="note">Rasmlar Cloudinary bulutida saqlanadi. Telefondan ham shu havola bilan ochiladi.</p>` : `<p class="note">Hozir rasmlar shu serverda saqlanadi. Cloudinary kaliti qo'yilsa, bulutga o'tadi.</p>`}
      ${meta.bg_removal === "fast" ? `<p class="note">Fon tez usulda tozalanadi. Murakkab fon uchun: pip install rembg</p>` : `<p class="note">rembg yoqilgan — fon aniqroq olib tashlanadi.</p>`}
      <button class="btn primary" type="submit" ${state.pending.length ? "" : "disabled"}>Garderobga saqlash</button>
    </div>
  </form>`;
}

function viewStylist() {
  const chips = ["Bugun nima kiyaman?", "Ishga qanday obraz?", "Yomg'ir yog'sa-chi?", "Kechki uchrashuv"].map((text) => `<button class="chip" type="button" data-action="chip-chat" data-text="${esc(text)}">${esc(text)}</button>`).join("");
  const messages = state.history.length ? state.history.map((message) => {
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
      <img src="${esc(advice.image_url)}" alt="Do'kon rasmi" style="height:220px;object-fit:contain;background:#efe6d8;border-radius:18px">
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
  if (!stats) return `<p class="boot">Hisoblanmoqda…</p>`;
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
    ["home", "Bugun"],
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
  const tabs = [["home", "Bugun", "☀"], ["wardrobe", "Kiyim", "▣"], ["stylist", "Stilist", "✎"], ["calendar", "Taqvim", "▦"], ["more", "Yana", "⋯"]];
  return tabs.map(([view, label, icon]) => `<button class="nav-btn${tabFor(state.view) === view ? " active" : ""}" data-action="${view === "more" ? "more" : "nav"}" data-view="${view}" data-nav="${view}"><strong>${icon}</strong>${label}</button>`).join("");
}

function renderShell() {
  document.getElementById("side").innerHTML = sideHTML();
  document.getElementById("tabbar").innerHTML = tabHTML();
}

function render() {
  const [kicker, title] = TITLES[state.view] || ["", ""];
  document.getElementById("topbar").innerHTML = `<div><p class="kicker">${kicker}</p><h1>${title}</h1></div>`;
  document.getElementById("view").innerHTML = views[state.view]();
  renderShell();
  const thread = document.getElementById("thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
}

async function go(view) {
  state.view = view;
  localStorage.setItem("garderob-view", view);
  if (view === "home") state.today = await api("/api/today");
  if (view === "stats") state.stats = await api("/api/stats");
  if (view === "calendar") await loadCalendar();
  if (view === "stylist" && !state.historyLoaded) {
    state.history = await api("/api/stylist/history");
    state.historyLoaded = true;
  }
  render();
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
    <div class="cloth-photo">${photo(item)}</div>
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
  if (state.view === "home") state.today = await api("/api/today");
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
  [meta, profile, items] = await Promise.all([api("/api/meta"), api("/api/profile"), api("/api/items")]);
  const saved = localStorage.getItem("garderob-view");
  await go(views[saved] ? saved : "home");
}

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "nav") {
      closeModal();
      await go(button.dataset.view);
    }
    else if (action === "more") {
      openModal(`<div class="stack">
        <div class="spread"><h2>Yana</h2><button class="icon-btn" data-action="close-modal">×</button></div>
        <button class="btn" data-action="nav" data-view="add">Kiyim qo'shish</button>
        <button class="btn" data-action="nav" data-view="shop">Xarid maslahati</button>
        <button class="btn" data-action="nav" data-view="stats">Statistika</button>
        <button class="btn" data-action="nav" data-view="profile">Profil</button>
      </div>`);
    } else if (action === "close-modal") closeModal();
    else if (action === "open-item") openItem(button.dataset.id);
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
  }
});

document.body.addEventListener("submit", async (event) => {
  const form = event.target;
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
      for (const row of state.pending) data.append("files", row.file);
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
      const file = document.getElementById("shop-file").files[0];
      if (!file) {
        toast("Rasm tanlang");
        return;
      }
      const data = new FormData();
      data.append("file", file);
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
  }
});

document.body.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "file-input" || target.id === "camera-input") {
    for (const file of target.files) {
      if (!file.type.startsWith("image/")) continue;
      state.pending.push({ file, url: URL.createObjectURL(file) });
    }
    target.value = "";
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
  } else if (target.id === "search") {
    state.q = target.value;
    const grid = document.getElementById("grid");
    if (grid) {
      const list = visibleItems();
      grid.innerHTML = list.length ? list.map(clothCard).join("") : `<p class="muted">Bu filtrda kiyim yo'q.</p>`;
    }
  }
});

document.body.addEventListener("input", (event) => {
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
