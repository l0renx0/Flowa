// Flowa — spese ed entrate. Nessun build: questo file è tutta la logica dell'app.
// I dati vivono nel telefono (localStorage) e, se collegato, in un repository GitHub privato.
'use strict';

const APP_VERSION = 'flowa-4'; // deve coincidere con version.json e con VERSION in sw.js
const DATA_KEY = 'flowa:data';
const SYNC_KEY = 'flowa:sync';
const UI_KEY = 'flowa:ui';

// ---------- Utilità ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const weekStart = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const monthKey = (s) => s.slice(0, 7);
const addMonths = (mk, n) => { const d = parse(mk + '-01'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
const endOfMonth = (mk) => { const d = parse(mk + '-01'); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
const nowIso = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// ?oggi=AAAA-MM-GG permette di provare l'app come se fosse un altro giorno.
const TODAY_OVERRIDE = new URLSearchParams(location.search).get('oggi');
const today = () => (/^\d{4}-\d{2}-\d{2}$/.test(TODAY_OVERRIDE || '') ? TODAY_OVERRIDE : iso(new Date()));

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const EUR0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmt = (n) => EUR.format(n || 0);
const fmt0 = (n) => EUR0.format(Math.round(n || 0));
const fmtAxis = (n) => (n >= 1000 ? (n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k' : Math.round(n).toString());
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MON3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WD = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const WD1 = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const monthName = (mk, year = true) => { const [y, m] = mk.split('-').map(Number); return MONTHS[m - 1] + (year ? ' ' + y : ''); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const weekLabel = (ws) => {
  const a = parse(ws), b = parse(addDays(ws, 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MON3[b.getMonth()]}` : `${a.getDate()} ${MON3[a.getMonth()]} – ${b.getDate()} ${MON3[b.getMonth()]}`;
};
const dayLabel = (s) => {
  const t = today();
  if (s === t) return 'Oggi';
  if (s === addDays(t, -1)) return 'Ieri';
  const d = parse(s);
  return `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== parse(t).getFullYear() ? ' ' + d.getFullYear() : ''}`;
};
const shortDate = (s) => { if (s === today()) return 'Oggi'; if (s === addDays(today(), -1)) return 'Ieri'; const d = parse(s); return `${d.getDate()} ${MON3[d.getMonth()]}`; };
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const vibrate = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

const ICON = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M9 6h11v12H9l-6-6z"/><path d="m12.5 9.5 5 5M17.5 9.5l-5 5"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>',
};
const METHODS = { carta: '💳 Carta', contanti: '💶 Contanti', bonifico: '🏦 Bonifico' };

const DEFAULT_CATEGORIES = [
  ['spesa', 'Spesa', 'expense', '🛒', '#1baf7a'], ['affitto', 'Affitto', 'expense', '🏠', '#6250d6'], ['casa', 'Casa', 'expense', '🧺', '#2a78d6'],
  ['uscite', 'Uscite e cibo fuori', 'expense', '🍝', '#eb6834'], ['svago', 'Svago', 'expense', '🎟️', '#e87ba4'], ['abbigliamento', 'Abbigliamento', 'expense', '👕', '#eda100'],
  ['cura', 'Cura personale', 'expense', '✂️', '#e34948'], ['trasporti', 'Trasporti', 'expense', '🚲', '#008300'], ['viaggi', 'Viaggi', 'expense', '✈️', '#0e9fb5'],
  ['regali', 'Regali', 'expense', '🎁', '#d6409f'], ['corsi', 'Corsi', 'expense', '📚', '#ab6400'], ['abbonamenti', 'Abbonamenti', 'expense', '🔁', '#8e4ec6'],
  ['altro', 'Altro', 'expense', '•', '#8b8d98'],
  ['stipendio', 'Stipendio', 'income', '💼', '#1baf7a'], ['mance', 'Mance', 'income', '🪙', '#eda100'], ['straordinari', 'Straordinari', 'income', '⏱️', '#0e9fb5'],
  ['lavoretti', 'Lavoretti', 'income', '🎬', '#2a78d6'], ['famiglia', 'Famiglia', 'income', '👪', '#d6409f'], ['vendite', 'Vendite', 'income', '🏷️', '#8e4ec6'],
  ['altro-in', 'Altre entrate', 'income', '✨', '#8b8d98'],
].map(([id, name, type, icon, color]) => ({ id, name, type, icon, color }));

const emptyData = () => ({
  app: 'flowa', version: 1, updatedAt: nowIso(), transactions: [],
  settings: { updatedAt: '1970-01-01T00:00:00Z', weekStart: 1, categories: DEFAULT_CATEGORIES, budgets: {}, recurring: [], people: [] },
});

// ---------- Stato ----------
const state = {
  data: store.get(DATA_KEY, null) || emptyData(),
  sync: store.get(SYNC_KEY, {}),
  syncStatus: 'local',
  syncError: '',
};
const ui = Object.assign({
  home: { month: null }, mov: { q: '', type: 'all', cat: null, limit: 150 },
  an: { tab: 'panoramica', pPeriod: 'mese', noRent: true, open: null, catPeriod: 'mese', catType: 'expense' },
  recapSeen: null,
}, store.get(UI_KEY, {}));
ui.home.month = null; ui.mov.limit = 150; ui.an.open = null;
const saveUi = () => store.set(UI_KEY, { an: { tab: ui.an.tab, pPeriod: ui.an.pPeriod, noRent: ui.an.noRent, catPeriod: ui.an.catPeriod, catType: ui.an.catType }, recapSeen: ui.recapSeen, mov: { type: ui.mov.type } });

const live = () => state.data.transactions.filter((t) => !t.deleted);
const cats = () => state.data.settings.categories;
const catById = (id) => cats().find((c) => c.id === id) || { id, name: id || 'Senza categoria', icon: '•', color: '#8b8d98', type: 'expense' };
const cost = (t) => (t.split ? t.split.mine : t.amount); // la mia parte di una spesa divisa
const txTitle = (t) => t.note || t.merchant || catById(t.category).name;

function persist(touch = true) {
  if (touch) state.data.updatedAt = nowIso();
  store.set(DATA_KEY, state.data);
  if (touch) scheduleSync();
}

function upsertTx(t) {
  t.updatedAt = nowIso();
  const i = state.data.transactions.findIndex((x) => x.id === t.id);
  if (i >= 0) state.data.transactions[i] = t; else state.data.transactions.push(t);
  persist();
}
function touchSettings() { state.data.settings.updatedAt = nowIso(); persist(); }

// Unisce due copie dei dati: per ogni movimento vince la modifica più recente (anche le eliminazioni).
function merge(a, b) {
  const map = new Map();
  for (const t of [...(a.transactions || []), ...(b.transactions || [])]) {
    const cur = map.get(t.id);
    if (!cur || (t.updatedAt || '') > (cur.updatedAt || '')) map.set(t.id, t);
  }
  const sa = a.settings || {}, sb = b.settings || {};
  const settings = (sb.updatedAt || '') > (sa.updatedAt || '') ? sb : sa;
  return {
    app: 'flowa', version: 1,
    updatedAt: (a.updatedAt || '') > (b.updatedAt || '') ? a.updatedAt : b.updatedAt,
    transactions: [...map.values()].sort((x, y) => (x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1)),
    settings: Object.assign(emptyData().settings, settings),
  };
}
const canon = (d) => JSON.stringify({ t: [...d.transactions].sort((x, y) => (x.id < y.id ? -1 : 1)), s: d.settings });

// ---------- Spese ricorrenti ----------
function* occurrences(rule, until) {
  let d = rule.start;
  if (!d || d > until) return;
  if (rule.freq === 'weekly') {
    const target = Number(rule.day);
    while (parse(d).getDay() !== target) d = addDays(d, 1);
    for (; d <= until; d = addDays(d, 7)) yield d;
  } else {
    let mk = monthKey(d);
    for (let guard = 0; guard < 600; guard++, mk = addMonths(mk, 1)) {
      const last = endOfMonth(mk);
      const day = Number(rule.day) === -1 ? last : `${mk}-${pad(Math.min(Number(rule.day) || 1, Number(last.slice(8))))}`;
      if (day > until) return;
      if (day >= rule.start) yield day;
    }
  }
}
function runRecurring() {
  const t = today(); let added = 0;
  const ids = new Set(state.data.transactions.map((x) => x.id));
  for (const r of state.data.settings.recurring || []) {
    if (!r.active) continue;
    for (const day of occurrences(r, t)) {
      const id = `r-${r.id}-${day}`;
      if (ids.has(id)) continue; // già creata (o eliminata a mano: non la ricreiamo)
      state.data.transactions.push({ id, type: r.type, amount: r.amount, date: day, category: r.category, merchant: r.merchant || null, note: r.note || null, method: r.method || null, recurring: r.id, updatedAt: nowIso() });
      ids.add(id); added++;
    }
  }
  if (added) persist();
  return added;
}

// ---------- Sincronizzazione con GitHub (repository privato) ----------
const b64enc = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const apiUrl = (cfg) => `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path || 'data.json'}`;
const ghHeaders = (cfg, extra = {}) => Object.assign({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, extra);

async function ghPull(cfg) {
  const res = await fetch(apiUrl(cfg), { headers: ghHeaders(cfg), cache: 'no-store' });
  if (res.status === 404) return { data: null, sha: null };
  if (res.status === 401) throw new Error('Il codice di accesso non è valido o è scaduto.');
  if (res.status === 403) throw new Error('Il codice di accesso non ha il permesso su questo archivio.');
  if (!res.ok) throw new Error('GitHub ha risposto ' + res.status);
  const j = await res.json();
  let text = j.content ? b64dec(j.content) : '';
  if (!text && j.size) { // file oltre 1 MB: va scaricato "grezzo"
    const raw = await fetch(apiUrl(cfg), { headers: ghHeaders(cfg, { Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
    text = await raw.text();
  }
  return { data: text ? JSON.parse(text) : null, sha: j.sha };
}
async function ghPush(cfg, data, sha) {
  const body = { message: `Flowa: aggiornamento ${new Date().toLocaleString('it-IT')}`, content: b64enc(JSON.stringify(data, null, 1)) };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(cfg), { method: 'PUT', headers: ghHeaders(cfg, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) { const e = new Error('conflitto'); e.conflict = true; throw e; }
  if (!res.ok) throw new Error('Salvataggio su GitHub non riuscito (' + res.status + ')');
  return (await res.json()).content.sha;
}

let syncTimer = null, syncing = null, syncAgain = false, lastSyncTry = 0;
function scheduleSync(ms = 1200) {
  if (!state.sync.token) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms);
}
async function syncNow() {
  const cfg = state.sync;
  if (!cfg.token) { setSync('local'); return; }
  if (syncing) { syncAgain = true; return syncing; }
  if (!navigator.onLine) { setSync('off'); return; }
  lastSyncTry = Date.now();
  setSync('busy');
  syncing = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await ghPull(cfg);
      const merged = remote.data ? merge(state.data, remote.data) : state.data;
      if (canon(merged) !== canon(state.data)) { state.data = merged; persist(false); runRecurring(); render(); }
      if (remote.data && canon(merged) === canon(remote.data)) return;
      try { await ghPush(cfg, state.data, remote.sha); return; } catch (e) { if (!e.conflict) throw e; }
    }
    throw new Error('Troppe modifiche contemporanee, riprova.');
  })();
  try {
    await syncing;
    state.sync.lastSync = nowIso(); store.set(SYNC_KEY, state.sync);
    setSync('ok');
  } catch (e) {
    state.syncError = e.message || String(e);
    setSync(navigator.onLine ? 'err' : 'off');
  } finally {
    syncing = null;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}
function setSync(s) {
  const was = state.syncStatus;
  state.syncStatus = s;
  if (route() === 'home' && ['err', 'off'].includes(was) !== ['err', 'off'].includes(s)) renderSoon();
  if (route() === 'altro') renderSoon();
  document.querySelectorAll('[data-sync]').forEach((el) => { el.dataset.s = s; el.querySelector('span').textContent = syncText(); });
  if (route().startsWith('altro/sync')) renderSoon();
}
const syncText = () => ({ local: 'Solo su questo dispositivo', busy: 'Sincronizzo…', ok: 'Sincronizzato', err: 'Errore di sincronizzazione', off: 'Offline' }[state.syncStatus]);
const syncBadge = () => `<a href="#/altro/sync" class="sync" data-sync data-s="${state.syncStatus}"><i></i><span>${syncText()}</span></a>`;

// ---------- Calcoli ----------
function weeksData(noRent) {
  const map = new Map();
  for (const t of live()) {
    if (t.type !== 'expense' || (noRent && t.category === 'affitto')) continue;
    const ws = weekStart(t.date);
    const w = map.get(ws) || { ws, total: 0, byCat: {}, txs: [] };
    const c = cost(t); w.total += c; w.byCat[t.category] = (w.byCat[t.category] || 0) + c; w.txs.push(t);
    map.set(ws, w);
  }
  const keys = [...map.keys()].sort();
  const cur = weekStart(today());
  const out = [];
  if (keys.length) for (let ws = keys[0]; ws <= cur; ws = addDays(ws, 7)) out.push(map.get(ws) || { ws, total: 0, byCat: {}, txs: [] });
  return out; // dalla più vecchia alla corrente
}
function weekAvg(weeks) {
  const done = weeks.filter((w) => w.ws < weekStart(today()) && w.total > 0).slice(-8);
  return done.length ? done.reduce((s, w) => s + w.total, 0) / done.length : 0;
}
function monthsData() {
  const map = new Map();
  for (const t of live()) {
    const mk = monthKey(t.date);
    const m = map.get(mk) || { mk, inc: 0, out: 0, byCat: {}, inCat: {} };
    if (t.type === 'income') { m.inc += t.amount; m.inCat[t.category] = (m.inCat[t.category] || 0) + t.amount; }
    else { const c = cost(t); m.out += c; m.byCat[t.category] = (m.byCat[t.category] || 0) + c; }
    map.set(mk, m);
  }
  const keys = [...map.keys()].sort();
  const cur = monthKey(today());
  const out = [];
  if (keys.length) for (let mk = keys[0]; mk <= cur; mk = addMonths(mk, 1)) out.push(map.get(mk) || { mk, inc: 0, out: 0, byCat: {}, inCat: {} });
  return out;
}
function sumRange(from, to, type = 'expense', filter = () => true) {
  let s = 0;
  for (const t of live()) if (t.type === type && t.date >= from && t.date <= to && filter(t)) s += type === 'expense' ? cost(t) : t.amount;
  return s;
}
function byCategory(from, to, type) {
  const m = {};
  for (const t of live()) if (t.type === type && t.date >= from && t.date <= to) m[t.category] = (m[t.category] || 0) + (type === 'expense' ? cost(t) : t.amount);
  return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}
function usage(type) {
  const n = {}; const cutoff = addDays(today(), -120);
  for (const t of live()) if (t.type === type) n[t.category] = (n[t.category] || 0) + (t.date >= cutoff ? 3 : 1);
  return n;
}
function topMerchants(type, category) {
  const n = {};
  for (const t of live()) if (t.type === type && t.merchant && (!category || t.category === category)) n[t.merchant] = (n[t.merchant] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
function people() {
  const set = new Set(state.data.settings.people || []);
  for (const t of live()) if (t.split?.person) set.add(t.split.person);
  return [...set];
}
function balances() {
  const b = {};
  for (const t of live()) {
    if (!t.split || t.split.settled) continue;
    const p = t.split.person; b[p] = b[p] || { amount: 0, txs: [] };
    b[p].amount += t.split.paidBy === 'them' ? -t.split.mine : t.amount - t.split.mine;
    b[p].txs.push(t);
  }
  return b;
}

// ---------- Grafici (SVG fatti a mano) ----------
const barPath = (x, y, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
function barChart({ items, height = 150, avg = null, highlight = null, labelEvery = 1, allStrong = false }) {
  // items: [{label, value, tip, key}]
  const W = 340, H = height, top = 8, bottom = 22, left = 30, right = 4;
  const max = Math.max(1, avg || 0, ...items.map((i) => i.value)) * 1.08;
  const ch = H - top - bottom, slot = (W - left - right) / items.length, bw = Math.max(4, Math.min(30, slot - 6));
  const y = (v) => top + ch - (v / max) * ch;
  const ticks = niceTicks(max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (const tv of ticks) s += `<line class="grid-l" x1="${left}" x2="${W - right}" y1="${y(tv)}" y2="${y(tv)}"/><text class="ax" x="${left - 6}" y="${y(tv) + 3.5}" text-anchor="end">${fmtAxis(tv)}</text>`;
  items.forEach((it, i) => {
    const x = left + slot * i + (slot - bw) / 2, h = (it.value / max) * ch;
    const hi = allStrong || highlight == null || highlight === it.key;
    s += `<g class="g"><path class="b" d="${barPath(x, y(it.value), bw, h)}" fill="${hi ? 'var(--bar)' : 'var(--bar-soft)'}"/>`;
    s += `<rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${ch + bottom}" data-tip="${esc(it.tip)}"/></g>`;
    if (i % labelEvery === 0 || i === items.length - 1) s += `<text class="ax${it.key === highlight ? ' ax-today' : ''}" x="${left + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  if (avg) s += `<line class="avg-l" x1="${left}" x2="${W - right}" y1="${y(avg)}" y2="${y(avg)}"/>`;
  return `<div class="chart">${s}</svg></div>`;
}
function groupedChart(months) {
  const W = 340, H = 170, top = 8, bottom = 22, left = 30, right = 4;
  const max = Math.max(1, ...months.flatMap((m) => [m.inc, m.out])) * 1.08;
  const ch = H - top - bottom, slot = (W - left - right) / months.length, bw = Math.max(3, Math.min(12, (slot - 8) / 2));
  const y = (v) => top + ch - (v / max) * ch;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrate e uscite per mese">`;
  for (const tv of niceTicks(max)) s += `<line class="grid-l" x1="${left}" x2="${W - right}" y1="${y(tv)}" y2="${y(tv)}"/><text class="ax" x="${left - 6}" y="${y(tv) + 3.5}" text-anchor="end">${fmtAxis(tv)}</text>`;
  months.forEach((m, i) => {
    const cx = left + slot * i + slot / 2;
    s += `<g class="g"><path class="b" d="${barPath(cx - bw - 1, y(m.inc), bw, (m.inc / max) * ch)}" fill="var(--series-in)"/><path class="b" d="${barPath(cx + 1, y(m.out), bw, (m.out / max) * ch)}" fill="var(--series-out)"/>`;
    s += `<rect class="hit" x="${left + slot * i}" y="${top}" width="${slot}" height="${ch + bottom}" data-tip="${esc(`<b>${cap(monthName(m.mk))}</b><br>Entrate ${fmt(m.inc)}<br>Uscite ${fmt(m.out)}`)}"/></g>`;
    s += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${MON3[Number(m.mk.slice(5)) - 1]}</text>`;
  });
  return `<div class="chart">${s}</svg></div><div class="legend"><span><i style="background:var(--series-in)"></i>Entrate</span><span><i style="background:var(--series-out)"></i>Uscite</span></div>`;
}
function niceTicks(max) {
  const raw = max / 3, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = 0; v <= max; v += step) out.push(v); return out;
}
// Tooltip comune a tutti i grafici
document.addEventListener('pointerover', (e) => {
  const hit = e.target.closest?.('.hit'); const chart = hit?.closest('.chart');
  document.querySelectorAll('.tip').forEach((t) => t.remove());
  if (!hit || !chart) return;
  const r = hit.getBoundingClientRect(), c = chart.getBoundingClientRect();
  const tip = document.createElement('div'); tip.className = 'tip'; tip.innerHTML = hit.dataset.tip;
  chart.appendChild(tip);
  const x = Math.min(Math.max(r.left - c.left + r.width / 2, tip.offsetWidth / 2), c.width - tip.offsetWidth / 2);
  tip.style.left = x + 'px'; tip.style.top = '-4px';
});

const icon = (c, lg) => `<span class="ic${lg ? ' ic--lg' : ''}" style="background:color-mix(in srgb, ${c.color} 16%, transparent)">${c.icon}</span>`;
function catBars(entries, total, link) {
  if (!entries.length) return `<div class="muted small">Nessun movimento in questo periodo.</div>`;
  return `<div class="cats">${entries.map(([id, v]) => {
    const c = catById(id); const tag = link ? 'button' : 'div';
    return `<${tag} class="catbar" ${link ? `data-action="cat-detail" data-cat="${esc(id)}"` : ''}>${`<span class="catbar__ic">${icon(c)}</span>`}<span class="catbar__name">${esc(c.name)}<span class="catbar__pct">${pct(v, total)}%</span></span><span class="catbar__val num">${fmt(v)}</span><span class="catbar__track"><i style="width:${Math.max(2, (v / entries[0][1]) * 100)}%;background:${c.color}"></i></span></${tag}>`;
  }).join('')}</div>`;
}
function stack(byCat, total) {
  const e = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!total) return '<div class="stack"></div>';
  return `<div class="stack">${e.map(([id, v]) => `<i style="flex:${v / total};background:${catById(id).color}" title="${esc(catById(id).name)}"></i>`).join('')}</div>`;
}
function txRow(t, opts = {}) {
  const c = catById(t.category);
  const sub = [opts.showDate ? shortDate(t.date) : null, t.note && t.merchant ? t.merchant : null, c.name].filter(Boolean).join(' · ');
  const tags = (t.recurring ? '<span class="tag">↻</span>' : '') + (t.split ? `<span class="tag">÷ ${esc(t.split.person)}</span>` : '') + (t.approx ? '<span class="tag" title="Data stimata">≈</span>' : '');
  const amt = t.type === 'income' ? `<span class="tx__amt num in">+${fmt(t.amount)}</span>` : `<span class="tx__amt num">−${fmt(cost(t))}${t.split ? `<small>su ${fmt(t.amount)}</small>` : ''}</span>`;
  return `<button class="tx" data-action="edit" data-id="${esc(t.id)}">${icon(c)}<span class="tx__main"><span class="tx__title">${esc(txTitle(t))}${tags}</span><span class="tx__sub">${esc(sub)}</span></span>${amt}</button>`;
}
function groupedTxs(list) {
  let html = '', curDay = null, bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    const out = bucket.filter((t) => t.type === 'expense').reduce((s, t) => s + cost(t), 0);
    html += `<div class="day"><span>${dayLabel(curDay)}</span><span class="num">${out ? '−' + fmt(out) : ''}</span></div>` + bucket.map((t) => txRow(t)).join('');
    bucket = [];
  };
  for (const t of list) { if (t.date !== curDay) { flush(); curDay = t.date; } bucket.push(t); }
  flush();
  return `<div class="txs">${html}</div>`;
}
const sortDesc = (list) => [...list].sort((a, b) => (a.date === b.date ? ((b.createdAt || b.updatedAt || '') > (a.createdAt || a.updatedAt || '') ? 1 : -1) : a.date < b.date ? 1 : -1));

// ---------- Viste ----------
const route = () => (location.hash.replace(/^#\/?/, '') || 'home');

function viewHome() {
  const t = today(), curMk = monthKey(t);
  const mk = ui.home.month || curMk;
  const months = monthsData();
  const firstMk = months[0]?.mk || curMk;
  const isCur = mk === curMk;
  const end = isCur ? t : endOfMonth(mk);
  const spent = sumRange(mk + '-01', end), inc = sumRange(mk + '-01', end, 'income');
  // confronto con il mese prima (allo stesso giorno, se è il mese in corso)
  const pm = addMonths(mk, -1);
  const pEnd = isCur ? `${pm}-${pad(Math.min(parse(t).getDate(), Number(endOfMonth(pm).slice(8))))}` : endOfMonth(pm);
  const prev = sumRange(pm + '-01', pEnd);
  const diff = prev ? Math.round(((spent - prev) / prev) * 100) : null;
  const trend = diff == null ? '' : `<span class="hero__trend">${diff <= 0 ? '↓' : '↑'} ${Math.abs(diff)}% rispetto a ${monthName(pm, false)}${isCur ? ' (stesso giorno)' : ''}</span>`;
  const [eInt, eDec] = fmt(spent).replace(/\s?€/, '').split(',');

  const weeks = weeksData(ui.an.noRent);
  const avg = weekAvg(weeks);
  const ws = weekStart(t);
  const wk = weeks.find((w) => w.ws === ws) || { total: 0, txs: [] };
  const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(ws, i); return { d, v: wk.txs.filter((x) => x.date === d).reduce((s, x) => s + cost(x), 0) }; });

  // Resoconto della settimana appena finita (lunedì e martedì)
  const lastWs = addDays(ws, -7);
  const lastW = weeks.find((w) => w.ws === lastWs);
  const dow = (parse(t).getDay() + 6) % 7;
  let recap = '';
  if (lastW && dow <= 1 && ui.recapSeen !== lastWs) {
    const d = avg ? Math.round(((lastW.total - avg) / avg) * 100) : 0;
    const top = Object.entries(lastW.byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
    recap = `<section class="card recap span-2">
      <div class="card__head"><div><div class="label">📬 Resoconto della settimana · ${weekLabel(lastWs)}</div></div><button class="x" data-action="recap-ok" aria-label="Chiudi">${ICON.x}</button></div>
      <div class="row" style="align-items:center;justify-content:space-between"><div class="recap__big num" style="flex:none">${fmt(lastW.total)}</div><div style="flex:none">${avg ? `<span class="pill ${d <= 0 ? 'pill--good' : 'pill--bad'}">${d <= 0 ? '↓' : '↑'} ${Math.abs(d)}% vs media</span>` : ''}</div></div>
      <div class="small muted" style="margin:6px 0 12px">${lastW.txs.length} spese${ui.an.noRent ? ' · affitto escluso' : ''}${top.length ? ' · soprattutto ' + top.map(([id]) => catById(id).name.toLowerCase()).join(', ') : ''}</div>
      ${stack(lastW.byCat, lastW.total)}
      <a class="card__link" style="display:inline-block;margin-top:12px" href="#/analisi" data-action="open-week" data-ws="${lastWs}">Vedi il dettaglio →</a>
    </section>`;
  }

  // Budget
  const budgets = state.data.settings.budgets || {};
  const bIds = Object.keys(budgets).filter((k) => budgets[k] > 0);
  let budgetCard = '';
  if (bIds.length) {
    const spentBy = Object.fromEntries(byCategory(curMk + '-01', t, 'expense'));
    const over = bIds.filter((id) => (spentBy[id] || 0) >= budgets[id] * 0.8);
    const tot = bIds.reduce((s, id) => s + budgets[id], 0), used = bIds.reduce((s, id) => s + (spentBy[id] || 0), 0);
    const p = pct(used, tot);
    budgetCard = `<a class="card" href="#/altro/budget"><div class="card__head"><span class="card__title">Budget di ${monthName(curMk, false)}</span><span class="small muted num">${fmt0(used)} di ${fmt0(tot)}</span></div>
      <div class="progress"><i class="${p >= 100 ? 'over' : p >= 80 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></i></div>
      <div class="small muted" style="margin-top:8px">${over.length ? `⚠️ ${over.map((id) => catById(id).name).join(', ')} ${over.length > 1 ? 'sono vicine' : 'è vicina'} al limite` : '✅ Tutto sotto controllo'}</div></a>`;
  }

  const recent = sortDesc(live().filter((x) => x.date <= t)).slice(0, 6);
  const todaySpent = sumRange(t, t);
  const catEntries = byCategory(mk + '-01', end, 'expense');
  const empty = !live().length;

  return `
  <header class="top"><div><div class="sub">${cap(dayLabel(t) === 'Oggi' ? WD[parse(t).getDay()] + ' ' + parse(t).getDate() + ' ' + MONTHS[parse(t).getMonth()] : t)}</div><h1>${todaySpent ? `Oggi <span class="num">${fmt(todaySpent)}</span>` : 'Oggi zero spese ✨'}</h1></div>${['err', 'off'].includes(state.syncStatus) ? syncBadge() : ''}</header>
  ${empty ? emptyState() : `
  <div class="grid grid--2">
    ${recap}
    <section class="hero span-2">
      <div class="hero__months"><button data-action="month" data-d="-1" ${mk <= firstMk ? 'disabled' : ''} aria-label="Mese precedente">${ICON.left}</button><button data-action="month" data-d="1" ${isCur ? 'disabled' : ''} aria-label="Mese successivo">${ICON.right}</button></div>
      <div style="position:relative;z-index:1">
        <div class="hero__label">Speso a ${monthName(mk, mk.slice(0, 4) !== curMk.slice(0, 4))}</div>
        <div class="hero__amount num">${eInt}<small>,${eDec} €</small></div>
        ${trend}
      </div>
      <div class="hero__row">
        <div class="hero__stat"><span class="label">Entrate</span><b class="num">${fmt(inc)}</b></div>
        <div class="hero__stat"><span class="label">Risparmio</span><b class="num">${inc - spent >= 0 ? '' : '−'}${fmt(Math.abs(inc - spent))}</b></div>
      </div>
    </section>

    <a class="card" href="#/analisi" data-action="an-tab" data-tab="settimane">
      <div class="card__head"><span class="card__title">Questa settimana</span><span class="small muted">${weekLabel(ws)}</span></div>
      <div class="row" style="align-items:flex-end;justify-content:space-between"><div class="week__total num" style="flex:none">${fmt(wk.total)}</div>${avg && dow > 0 ? `<span class="pill ${wk.total <= avg ? 'pill--good' : 'pill--bad'}" style="flex:none">${wk.total <= avg ? `${fmt0(avg - wk.total)} sotto la media` : `${fmt0(wk.total - avg)} sopra la media`}</span>` : ''}</div>
      <div class="small muted" style="margin-top:4px">${avg ? `Media settimanale ${fmt0(avg)}` : ''}${ui.an.noRent ? ' · senza affitto' : ''}</div>
      <div class="week__chart">${barChart({ items: days.map((x, i) => ({ label: WD1[i], value: x.v, key: x.d, tip: `<b>${cap(dayLabel(x.d))}</b><br>${fmt(x.v)}` })), height: 120, highlight: t, allStrong: true })}</div>
    </a>

    <section class="card">
      <div class="card__head"><span class="card__title">Dove vanno i soldi</span><a class="card__link" href="#/analisi" data-action="an-tab" data-tab="categorie">Tutte</a></div>
      ${catBars(catEntries.slice(0, 4), spent, true)}
    </section>

    ${budgetCard}

    <section class="card ${budgetCard ? '' : 'span-2'}">
      <div class="card__head"><span class="card__title">Ultimi movimenti</span><a class="card__link" href="#/movimenti">Vedi tutti</a></div>
      <div class="txs">${recent.map((x) => txRow(x, { showDate: true })).join('')}</div>
    </section>
  </div>`}`;
}
function emptyState() {
  return `<div class="card empty"><div class="big">🌊</div><h3>Benvenuto in Flowa</h3><p>Per ritrovare tutte le tue spese, collega l'archivio privato su GitHub. Oppure inizia subito ad aggiungere movimenti con il tasto +.</p>
  <a class="btn btn--primary" href="#/altro/sync">Collega i miei dati</a></div>`;
}

function viewMovimenti() {
  const f = ui.mov;
  const q = f.q.trim().toLowerCase();
  let list = live();
  if (f.type !== 'all') list = list.filter((t) => t.type === f.type);
  if (f.cat) list = list.filter((t) => t.category === f.cat);
  if (q) list = list.filter((t) => [t.note, t.merchant, catById(t.category).name, String(t.amount).replace('.', ','), dayLabel(t.date), METHODS[t.method]].join(' ').toLowerCase().includes(q));
  list = sortDesc(list);
  const out = list.filter((t) => t.type === 'expense').reduce((s, t) => s + cost(t), 0);
  const inc = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const catList = cats().filter((c) => f.type === 'all' || c.type === f.type);
  return `
  <header class="top"><div><div class="sub">${live().length} movimenti in tutto</div><h1>Movimenti</h1></div></header>
  <div class="search">${ICON.search}<input id="q" type="search" placeholder="Cerca: Aldi, cena, 12,50…" value="${esc(f.q)}" autocomplete="off"></div>
  <div class="seg seg--full" style="margin-bottom:10px">${[['all', 'Tutti'], ['expense', 'Spese'], ['income', 'Entrate']].map(([k, l]) => `<button class="${f.type === k ? 'on' : ''}" data-action="mov-type" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="chips" style="margin-bottom:12px"><button class="chip ${!f.cat ? 'on' : ''}" data-action="mov-cat" data-v="">Tutte</button>${catList.map((c) => `<button class="chip ${f.cat === c.id ? 'on' : ''}" data-action="mov-cat" data-v="${c.id}"><span class="e">${c.icon}</span>${esc(c.name)}</button>`).join('')}</div>
  <div class="summary"><div><span class="label">Movimenti</span><b class="num">${list.length}</b></div>${f.type !== 'income' ? `<div><span class="label">Uscite</span><b class="num">${fmt(out)}</b></div>` : ''}${f.type !== 'expense' ? `<div><span class="label">Entrate</span><b class="num" style="color:var(--income)">${fmt(inc)}</b></div>` : ''}</div>
  <section class="card card--flat" style="margin-top:12px;padding:6px 10px">
    ${list.length ? groupedTxs(list.slice(0, f.limit)) : '<div class="empty"><div class="big">🔎</div><h3>Nessun risultato</h3><p>Prova con un\'altra parola o togli i filtri.</p></div>'}
    ${list.length > f.limit ? `<button class="more" data-action="more">Mostra altri ${Math.min(150, list.length - f.limit)}</button>` : ''}
  </section>`;
}

function viewAnalisi() {
  const tab = ui.an.tab;
  const seg = `<div class="seg seg--full" style="margin-bottom:14px">${[['panoramica', 'Panoramica'], ['settimane', 'Settimane'], ['mesi', 'Mesi'], ['categorie', 'Categorie']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="an-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'panoramica') body = viewPanoramica();
  else if (tab === 'settimane') {
    const weeks = weeksData(ui.an.noRent);
    const avg = weekAvg(weeks);
    const cur = weekStart(today());
    const last12 = weeks.slice(-12);
    const done = weeks.filter((w) => w.ws < cur && w.total > 0);
    const best = done.length ? done.reduce((a, b) => (b.total < a.total ? b : a)) : null;
    const worst = done.length ? done.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    body = `
    <div class="row" style="margin-bottom:12px;justify-content:space-between"><span class="small muted" style="flex:1">Ogni settimana va da lunedì a domenica.</span>
      <button class="chip ${ui.an.noRent ? 'on' : ''}" style="flex:none" data-action="no-rent">${ui.an.noRent ? '✓ ' : ''}Senza affitto</button></div>
    <div class="grid grid--2">
      <section class="card span-2">
        <div class="card__head"><span class="card__title">Ultime 12 settimane</span><span class="small muted">--- media ${fmt0(avg)}</span></div>
        ${weeks.length ? barChart({ items: last12.map((w) => ({ label: `${parse(w.ws).getDate()}/${parse(w.ws).getMonth() + 1}`, value: w.total, key: w.ws, tip: `<b>${weekLabel(w.ws)}</b><br>${fmt(w.total)}` })), height: 170, avg, highlight: cur, labelEvery: 2 }) : '<div class="muted small">Ancora nessuna spesa.</div>'}
      </section>
      <div class="summary span-2" style="margin:0">
        <div><span class="label">Media</span><b class="num">${fmt0(avg)}</b></div>
        <div><span class="label">La più leggera</span><b class="num">${best ? fmt0(best.total) : '–'}</b><span class="label">${best ? weekLabel(best.ws) : ''}</span></div>
        <div><span class="label">La più cara</span><b class="num">${worst ? fmt0(worst.total) : '–'}</b><span class="label">${worst ? weekLabel(worst.ws) : ''}</span></div>
      </div>
      <section class="card span-2" style="padding:4px 16px">
        ${[...weeks].reverse().map((w) => periodRow(w.ws, w.ws === cur ? 'Questa settimana' : weekLabel(w.ws), w.total, w.byCat, w.txs, w.ws < cur && avg && w.total ? Math.round(((w.total - avg) / avg) * 100) : null)).join('')}
      </section>
    </div>`;
  } else if (tab === 'mesi') {
    const months = monthsData();
    const curMk = monthKey(today());
    body = `
    <div class="grid grid--2">
      <section class="card span-2"><div class="card__head"><span class="card__title">Entrate e uscite</span><span class="small muted">ultimi 12 mesi</span></div>${months.length ? groupedChart(months.slice(-12)) : ''}</section>
      <section class="card span-2" style="padding:4px 16px">
        ${[...months].reverse().map((m) => {
          const save = m.inc - m.out, open = ui.an.open === m.mk;
          return `<div class="period" role="button" tabindex="0" data-action="toggle" data-k="${m.mk}"><div class="period__row"><span class="period__name">${cap(monthName(m.mk))}${m.mk === curMk ? ' <span class="tag">in corso</span>' : ''}</span><span class="period__val num">${m.out ? '−' : ''}${fmt(m.out)}</span></div>
            <div class="period__row small muted" style="margin-top:3px"><span>Entrate <span class="num" style="color:var(--income)">+${fmt(m.inc)}</span></span><span>${save >= 0 ? 'Risparmiati' : 'Sotto di'} <b class="num" style="color:${save >= 0 ? 'var(--income)' : 'var(--danger)'}">${fmt(Math.abs(save))}</b>${m.inc && save > 0 ? ` · ${pct(save, m.inc)}%` : ''}</span></div>
            ${stack(m.byCat, m.out)}
            ${open ? `<div class="period__detail">${catBars(Object.entries(m.byCat).sort((a, b) => b[1] - a[1]), m.out)}${Object.keys(m.inCat).length ? `<div class="label" style="margin:16px 0 10px">Entrate</div>${catBars(Object.entries(m.inCat).sort((a, b) => b[1] - a[1]), m.inc)}` : ''}</div>` : ''}
          </div>`;
        }).join('')}
      </section>
    </div>`;
  } else {
    const t = today(), mk = monthKey(t);
    const P = { mese: ['Questo mese', mk + '-01', t], scorso: ['Mese scorso', addMonths(mk, -1) + '-01', endOfMonth(addMonths(mk, -1))], tre: ['3 mesi', addMonths(mk, -2) + '-01', t], anno: ['Quest\'anno', mk.slice(0, 4) + '-01-01', t], tutto: ['Tutto', '0000-01-01', t] };
    const [, from, to] = P[ui.an.catPeriod] || P.mese;
    const type = ui.an.catType;
    const entries = byCategory(from, to, type);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    body = `
      <div class="seg" style="margin-bottom:10px">${[['expense', 'Spese'], ['income', 'Entrate']].map(([k, l]) => `<button class="${type === k ? 'on' : ''}" data-action="cat-type" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="chips" style="margin-bottom:14px">${Object.entries(P).map(([k, [l]]) => `<button class="chip ${ui.an.catPeriod === k ? 'on' : ''}" data-action="cat-period" data-v="${k}">${l}</button>`).join('')}</div>
      <section class="card"><div class="card__head"><span class="card__title">${type === 'expense' ? 'Totale speso' : 'Totale entrate'}</span><span class="num" style="font-weight:600;font-size:18px">${fmt(total)}</span></div>${catBars(entries, total, true)}</section>`;
  }
  return `<header class="top"><div><div class="sub">Il tuo resoconto</div><h1>Resoconti</h1></div></header>${seg}${body}`;
}
function periodRow(key, name, total, byCat, txs, delta) {
  const open = ui.an.open === key;
  return `<div class="period" role="button" tabindex="0" data-action="toggle" data-k="${key}" id="p-${key}">
    <div class="period__row"><span class="period__name">${name}</span><span style="display:flex;gap:8px;align-items:center">${delta != null ? `<span class="pill ${delta <= 0 ? 'pill--good' : 'pill--bad'}">${delta <= 0 ? '↓' : '↑'}${Math.abs(delta)}%</span>` : ''}<span class="period__val num">${fmt(total)}</span></span></div>
    ${stack(byCat, total)}
    ${open ? `<div class="period__detail">${catBars(Object.entries(byCat).sort((a, b) => b[1] - a[1]), total)}<div style="margin-top:12px">${sortDesc(txs).map((t) => txRow(t, { showDate: true })).join('') || '<span class="muted small">Nessuna spesa.</span>'}</div></div>` : ''}
  </div>`;
}

// ---------- Panoramica: il resoconto approfondito ----------
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const firstDate = () => live().reduce((f, t) => (!f || t.date < f ? t.date : f), null) || today();
const isFixed = (t) => t.category === 'affitto' || t.category === 'abbonamenti' || !!t.recurring; // spese fisse
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function periodRange(key) {
  const t = today(), mk = monthKey(t), pm = addMonths(mk, -1), y = Number(mk.slice(0, 4));
  const sameDay = (m) => `${m}-${pad(Math.min(parse(t).getDate(), Number(endOfMonth(m).slice(8))))}`;
  const R = {
    mese: { label: cap(monthName(mk, false)), from: mk + '-01', to: t, prevFrom: pm + '-01', prevTo: sameDay(pm), prevLabel: `${monthName(pm, false)} allo stesso giorno`, month: mk },
    scorso: { label: cap(monthName(pm, false)), from: pm + '-01', to: endOfMonth(pm), prevFrom: addMonths(pm, -1) + '-01', prevTo: endOfMonth(addMonths(pm, -1)), prevLabel: monthName(addMonths(pm, -1), false), month: pm },
    tre: { label: 'Ultimi 3 mesi', from: addMonths(mk, -2) + '-01', to: t, prevFrom: addMonths(mk, -5) + '-01', prevTo: endOfMonth(addMonths(mk, -3)), prevLabel: 'i 3 mesi prima' },
    anno: { label: String(y), from: y + '-01-01', to: t, prevFrom: (y - 1) + '-01-01', prevTo: (y - 1) + t.slice(4), prevLabel: `il ${y - 1}` },
    tutto: { label: 'Da sempre', from: firstDate(), to: t },
  };
  const r = R[key] || R.mese;
  const f0 = firstDate();
  r.realFrom = r.from < f0 ? f0 : r.from;
  r.days = Math.max(1, daysBetween(r.realFrom, r.to) + 1);
  if (r.prevTo && r.prevTo < f0) { delete r.prevFrom; delete r.prevTo; } // niente dati prima: niente confronto
  return r;
}
function periodStats(from, to) {
  const ex = [], inc = [];
  for (const t of live()) if (t.date >= from && t.date <= to) (t.type === 'income' ? inc : ex).push(t);
  const byCat = {}; for (const t of ex) byCat[t.category] = (byCat[t.category] || 0) + cost(t);
  return { ex, inc, byCat, spent: ex.reduce((s, t) => s + cost(t), 0), income: inc.reduce((s, t) => s + t.amount, 0) };
}
function projection() {
  const t = today(), mk = monthKey(t), dayN = parse(t).getDate(), daysIn = Number(endOfMonth(mk).slice(8));
  const st = periodStats(mk + '-01', t);
  const variable = st.ex.filter((x) => !isFixed(x)).reduce((s, x) => s + cost(x), 0);
  const ids = new Set(state.data.transactions.map((x) => x.id));
  let upcoming = 0;
  for (const r of state.data.settings.recurring || []) {
    if (!r.active || r.type !== 'expense') continue;
    for (const d of occurrences(r, endOfMonth(mk))) if (d > t && !ids.has(`r-${r.id}-${d}`)) upcoming += r.amount;
  }
  const rate = variable / dayN;
  return { spent: st.spent, variable, upcoming, rate, dayN, daysIn, projected: st.spent + rate * (daysIn - dayN) + upcoming };
}
function cumulative(mk, upto) {
  const n = Number(endOfMonth(mk).slice(8)); const arr = new Array(n).fill(0);
  for (const t of live()) if (t.type === 'expense' && monthKey(t.date) === mk && t.date <= upto) arr[Number(t.date.slice(8)) - 1] += cost(t);
  let s = 0; return arr.map((v) => (s += v));
}

// Grafico a linee (andamento cumulativo del mese)
function lineChart({ series, n, height = 180, tip, ticks }) {
  const W = 340, H = height, top = 10, bottom = 22, left = 34, right = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p[1]))) * 1.08;
  const cw = W - left - right, ch = H - top - bottom;
  const x = (i) => left + (i / Math.max(1, n - 1)) * cw, y = (v) => top + ch - (v / max) * ch;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (const tv of niceTicks(max)) s += `<line class="grid-l" x1="${left}" x2="${W - right}" y1="${y(tv)}" y2="${y(tv)}"/><text class="ax" x="${left - 6}" y="${y(tv) + 3.5}" text-anchor="end">${fmtAxis(tv)}</text>`;
  for (const se of series) {
    if (!se.points.length) continue;
    const d = se.points.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    if (se.area) s += `<path d="${d}L${x(se.points[se.points.length - 1][0])},${top + ch}L${x(se.points[0][0])},${top + ch}Z" fill="${se.color}" opacity=".08"/>`;
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ' stroke-dasharray="4 5"' : ''}/>`;
    if (se.dot) { const [i, v] = se.points[se.points.length - 1]; s += `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`; }
  }
  for (const i of ticks) s += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`;
  const step = cw / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) s += `<rect class="hit" x="${x(i) - step / 2}" y="${top}" width="${step}" height="${ch}" data-tip="${esc(tip(i))}"/>`;
  return `<div class="chart">${s}</svg></div><div class="legend">${series.filter((x) => x.name).map((se) => `<span><i style="background:${se.color}${se.dash ? ';opacity:.6' : ''}"></i>${esc(se.name)}</span>`).join('')}</div>`;
}

// Calendario a colori: più è scuro, più hai speso quel giorno (solo spese variabili)
function heatmap(from, to, monthly) {
  const daily = {};
  for (const t of live()) if (t.type === 'expense' && t.date >= from && t.date <= to && !isFixed(t)) daily[t.date] = (daily[t.date] || 0) + cost(t);
  const vals = Object.values(daily).sort((a, b) => a - b);
  const ref = vals.length ? vals[Math.floor(vals.length * 0.9)] : 1;
  const level = (v) => (!v ? 0 : v <= ref * 0.25 ? 1 : v <= ref * 0.5 ? 2 : v <= ref * 0.85 ? 3 : 4);
  const cell = (d, num) => {
    if (!d) return '<span class="hm__c hm__c--empty"></span>';
    const v = daily[d] || 0, future = d > today();
    return `<span class="hm__c hit${future ? ' hm__c--future' : ''}" data-l="${future ? 0 : level(v)}" data-tip="${esc(`<b>${cap(dayLabel(d))}</b><br>${v ? fmt(v) : 'Nessuna spesa'}`)}">${num ? parse(d).getDate() : ''}</span>`;
  };
  let html = '';
  if (monthly) {
    const mk = monthKey(from), last = endOfMonth(mk);
    const lead = (parse(mk + '-01').getDay() + 6) % 7;
    html = `<div class="hm hm--month">${WD1.map((w) => `<span class="hm__h">${w}</span>`).join('')}${'<span class="hm__c hm__c--empty"></span>'.repeat(lead)}`;
    for (let d = mk + '-01'; d <= last; d = addDays(d, 1)) html += cell(d, true);
    html += '</div>';
  } else {
    const cols = [];
    for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) cols.push(ws);
    html = `<div class="hm hm--weeks" style="grid-template-columns:repeat(${cols.length},1fr)">`;
    for (let r = 0; r < 7; r++) for (const ws of cols) { const d = addDays(ws, r); html += d < from || d > to ? cell(null) : cell(d, false); }
    html += '</div>';
  }
  const zero = (() => { let n = 0; for (let d = from; d <= (to < today() ? to : today()); d = addDays(d, 1)) if (!daily[d]) n++; return n; })();
  return { html: `<div class="chart">${html}</div><div class="hm__legend"><span>meno</span>${[0, 1, 2, 3, 4].map((l) => `<span class="hm__c" data-l="${l}"></span>`).join('')}<span>più</span></div>`, zero, daily };
}

function insights(r, st, prev) {
  const out = [];
  const exVar = st.ex.filter((t) => !isFixed(t));
  // 1. categorie che cambiano di più rispetto al periodo prima
  if (prev) {
    const ids = new Set([...Object.keys(st.byCat), ...Object.keys(prev.byCat)]);
    const deltas = [...ids].filter((id) => !['affitto'].includes(id)).map((id) => [id, (st.byCat[id] || 0) - (prev.byCat[id] || 0), prev.byCat[id] || 0]);
    const up = deltas.filter((d) => d[1] >= 15 && (!d[2] || d[1] / d[2] >= 0.25)).sort((a, b) => b[1] - a[1])[0];
    const down = deltas.filter((d) => d[1] <= -15 && d[2] && -d[1] / d[2] >= 0.25).sort((a, b) => a[1] - b[1])[0];
    if (up) out.push({ ic: '📈', tone: 'bad', t: `<b>${esc(catById(up[0]).name)}</b> è salita di <b>${fmt0(up[1])}</b>${up[2] ? ` (+${pct(up[1], up[2])}%)` : ''} rispetto a ${r.prevLabel}.` });
    if (down) out.push({ ic: '📉', tone: 'good', t: `<b>${esc(catById(down[0]).name)}</b> è scesa di <b>${fmt0(-down[1])}</b> (−${pct(-down[1], down[2])}%) rispetto a ${r.prevLabel}. Bravo!` });
  }
  // 2. giorno della settimana più caro
  if (r.days >= 14 && exVar.length >= 8) {
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    for (let d = r.realFrom; d <= r.to; d = addDays(d, 1)) cnt[(parse(d).getDay() + 6) % 7]++;
    for (const t of exVar) sum[(parse(t.date).getDay() + 6) % 7] += cost(t);
    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0)); const i = avg.indexOf(Math.max(...avg));
    const all = sum.reduce((a, b) => a + b, 0) / Math.max(1, cnt.reduce((a, b) => a + b, 0));
    if (avg[i] > all * 1.2) out.push({ ic: '📅', t: `Il <b>${WD[(i + 1) % 7]}</b> è il giorno in cui spendi di più: in media <b>${fmt(avg[i])}</b>, contro ${fmt(all)} degli altri giorni.` });
  }
  // 3. negozio preferito
  const m = {};
  for (const t of st.ex) if (t.merchant && !t.recurring) { const k = normKey(t.merchant); m[k] = m[k] || { name: t.merchant, n: 0, s: 0 }; m[k].n++; m[k].s += cost(t); }
  const top = Object.values(m).sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 3) out.push({ ic: '🏪', t: `Il posto dove vai più spesso è <b>${esc(top.name)}</b>: ${top.n} volte, ${fmt(top.s)} in tutto (in media ${fmt(top.s / top.n)} a volta).` });
  // 4. la spesa più grande (escluse quelle fisse)
  const big = [...exVar].sort((a, b) => cost(b) - cost(a))[0];
  if (big && cost(big) >= 20) out.push({ ic: '💸', t: `La spesa più grande è stata <b>${esc(txTitle(big))}</b>: ${fmt(cost(big))}, ${lc(dayLabel(big.date))}.` });
  // 5. le piccole spese che si sommano
  const small = exVar.filter((t) => cost(t) < 5);
  if (small.length >= 5) out.push({ ic: '🪙', t: `<b>${small.length} spese sotto i 5 €</b>: sembrano niente, ma insieme fanno <b>${fmt(small.reduce((s, t) => s + cost(t), 0))}</b>.` });
  // 6. risparmio
  if (st.income > 0) {
    const save = st.income - st.spent;
    out.push(save >= 0 ? { ic: '💰', tone: 'good', t: `Hai messo da parte <b>${fmt(save)}</b>, cioè il <b>${pct(save, st.income)}%</b> di quello che hai guadagnato.` }
      : { ic: '⚠️', tone: 'bad', t: `Hai speso <b>${fmt(-save)}</b> più di quanto hai guadagnato in questo periodo.` });
  }
  // 7. contanti
  const withM = st.ex.filter((t) => t.method);
  const cash = withM.filter((t) => t.method === 'contanti').length;
  if (withM.length >= 8 && cash) out.push({ ic: '💶', t: `Paghi in contanti il <b>${pct(cash, withM.length)}%</b> delle volte.` });
  return out;
}

function viewPanoramica() {
  const key = ui.an.pPeriod || 'mese';
  const r = periodRange(key);
  const st = periodStats(r.from, r.to);
  const prev = r.prevFrom ? periodStats(r.prevFrom, r.prevTo) : null;
  const save = st.income - st.spent;
  const perDay = st.spent / r.days;
  const dPrev = prev && prev.spent ? Math.round(((st.spent - prev.spent) / prev.spent) * 100) : null;
  const chips = [['mese', 'Questo mese'], ['scorso', 'Mese scorso'], ['tre', '3 mesi'], ['anno', 'Quest\'anno'], ['tutto', 'Tutto']];
  let html = `<div class="chips" style="margin-bottom:14px">${chips.map(([k, l]) => `<button class="chip ${key === k ? 'on' : ''}" data-action="p-period" data-v="${k}">${l}</button>`).join('')}</div>`;

  // Numeri principali
  html += `<div class="kpis">
    <div class="kpi kpi--main"><span class="label">Speso · ${esc(r.label)}</span><b class="num">${fmt(st.spent)}</b>${dPrev != null ? `<span class="pill ${dPrev <= 0 ? 'pill--good' : 'pill--bad'}">${dPrev <= 0 ? '↓' : '↑'} ${Math.abs(dPrev)}% rispetto a ${esc(r.prevLabel)}</span>` : ''}</div>
    <div class="kpi"><span class="label">Entrate</span><b class="num" style="color:var(--income)">${fmt(st.income)}</b></div>
    <div class="kpi"><span class="label">${save >= 0 ? 'Risparmio' : 'Sotto di'}</span><b class="num" style="color:${save >= 0 ? 'var(--income)' : 'var(--danger)'}">${fmt(Math.abs(save))}</b>${st.income && save > 0 ? `<span class="label">${pct(save, st.income)}% delle entrate</span>` : ''}</div>
    <div class="kpi"><span class="label">Al giorno</span><b class="num">${fmt(perDay)}</b><span class="label">su ${r.days} giorni</span></div>
    <div class="kpi"><span class="label">Spese</span><b class="num">${st.ex.length}</b><span class="label">${st.ex.length ? `in media ${fmt(st.spent / st.ex.length)}` : ''}</span></div>
  </div>`;

  html += '<div class="grid grid--2" style="margin-top:14px">';
  // Previsione e ritmo del mese
  if (r.month) {
    const mk = r.month, isCur = mk === monthKey(today());
    const n = Number(endOfMonth(mk).slice(8));
    const cur = cumulative(mk, r.to), pm = addMonths(mk, -1), pc = cumulative(pm, endOfMonth(pm));
    const upto = isCur ? parse(today()).getDate() : n;
    const series = [
      { name: cap(monthName(pm, false)), color: 'var(--ink-3)', points: pc.slice(0, n).map((v, i) => [i, v]) },
      { name: cap(monthName(mk, false)), color: 'var(--accent)', area: true, dot: isCur, points: cur.slice(0, upto).map((v, i) => [i, v]) },
    ];
    let proj = '';
    if (isCur) {
      const p = projection();
      series.push({ name: 'Previsione', color: 'var(--accent)', dash: true, points: [[upto - 1, cur[upto - 1]], [n - 1, p.projected]] });
      const prevTot = pc[pc.length - 1];
      const diff = prevTot ? Math.round(((p.projected - prevTot) / prevTot) * 100) : null;
      proj = `<div class="forecast"><div><span class="label">🔮 A questo ritmo finirai ${monthName(mk, false)} a circa</span><b class="num">${fmt0(p.projected)}</b></div>
        <div class="small muted">Spendi in media ${fmt(p.rate)} al giorno in spese variabili${p.upcoming ? `, e devono ancora arrivare ${fmt(p.upcoming)} di spese fisse` : ''}.${diff != null ? ` ${cap(monthName(pm, false))} era finito a ${fmt0(prevTot)} (${diff <= 0 ? '' : '+'}${diff}%).` : ''}</div></div>`;
    }
    const ticks = [0, 6, 13, 20, n - 1];
    html += `<section class="card span-2"><div class="card__title">Il ritmo del mese</div><div class="small muted" style="margin:2px 0 14px">Quanto hai speso in tutto, giorno dopo giorno</div>
      ${proj}${lineChart({ series, n, ticks, tip: (i) => `<b>${i + 1} ${MON3[Number(mk.slice(5)) - 1]}</b><br>${cap(monthName(mk, false))}: ${i < upto ? fmt(cur[i]) : '–'}<br>${cap(monthName(pm, false))}: ${fmt(pc[Math.min(i, pc.length - 1)])}` })}</section>`;
  }

  // Cose che ho notato
  const ins = insights(r, st, prev);
  if (ins.length) html += `<section class="card span-2"><div class="card__head"><span class="card__title">✨ Cose che ho notato</span></div><div class="insights">${ins.map((x) => `<div class="insight ${x.tone ? 'insight--' + x.tone : ''}"><span class="insight__ic">${x.ic}</span><p>${x.t}</p></div>`).join('')}</div></section>`;

  // Calendario
  const hm = heatmap(r.realFrom, r.to, !!r.month);
  html += `<section class="card"><div class="card__head"><span class="card__title">Il calendario delle spese</span></div>
    <div class="small muted" style="margin:-8px 0 12px">Spese variabili (senza affitto e abbonamenti). ${hm.zero ? `<b>${hm.zero} giorni</b> senza spendere niente 🧘` : ''}</div>${hm.html}</section>`;

  // Giorni della settimana
  {
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    for (let d = r.realFrom; d <= r.to; d = addDays(d, 1)) cnt[(parse(d).getDay() + 6) % 7]++;
    for (const t of st.ex) if (!isFixed(t)) sum[(parse(t.date).getDay() + 6) % 7] += cost(t);
    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
    const mx = avg.indexOf(Math.max(...avg));
    html += `<section class="card"><div class="card__head"><span class="card__title">Giorni della settimana</span><span class="small muted">media al giorno</span></div>
      ${barChart({ items: avg.map((v, i) => ({ label: WD1[i], value: v, key: i, tip: `<b>${cap(WD[(i + 1) % 7])}</b><br>in media ${fmt(v)}<br>${fmt(sum[i])} in ${cnt[i]} giorni` })), height: 150, highlight: Math.max(...avg) > 0 ? mx : null })}
      <div class="small muted" style="margin-top:8px">${Math.max(...avg) > 0 ? `Il giorno più caro è il <b>${WD[(mx + 1) % 7]}</b>.` : ''}</div></section>`;
  }

  // Confronto per categoria
  if (prev) {
    const ids = [...new Set([...Object.keys(st.byCat), ...Object.keys(prev.byCat)])].sort((a, b) => (st.byCat[b] || 0) - (st.byCat[a] || 0)).slice(0, 9);
    html += `<section class="card"><div class="card__head"><span class="card__title">Rispetto a ${esc(r.prevLabel)}</span></div><div class="cmp">${ids.map((id) => {
      const a = st.byCat[id] || 0, b = prev.byCat[id] || 0, d = a - b, c = catById(id);
      const tag = !b ? '<span class="pill">nuova</span>' : Math.abs(d) < 1 ? '<span class="pill">=</span>' : `<span class="pill ${d < 0 ? 'pill--good' : 'pill--bad'}">${d < 0 ? '↓' : '↑'} ${fmt0(Math.abs(d))}</span>`;
      return `<button class="cmp__row" data-action="cat-detail" data-cat="${id}">${icon(c)}<span class="cmp__name">${esc(c.name)}<span class="small muted num">${fmt0(b)} → ${fmt0(a)}</span></span>${tag}</button>`;
    }).join('')}</div></section>`;
  }

  // Dove spendi
  const m = {};
  for (const t of st.ex) if (t.merchant && !t.recurring) { const k = normKey(t.merchant); m[k] = m[k] || { name: t.merchant, n: 0, s: 0, cat: t.category }; m[k].n++; m[k].s += cost(t); }
  const shops = Object.values(m).sort((a, b) => b.s - a.s).slice(0, 6);
  if (shops.length) html += `<section class="card"><div class="card__head"><span class="card__title">Dove spendi di più</span></div><div class="cats">${shops.map((s) => `<div class="catbar"><span class="catbar__ic">${icon(catById(s.cat))}</span><span class="catbar__name">${esc(s.name)}<span class="catbar__pct">${s.n} ${s.n === 1 ? 'volta' : 'volte'} · in media ${fmt(s.s / s.n)}</span></span><span class="catbar__val num">${fmt(s.s)}</span><span class="catbar__track"><i style="width:${(s.s / shops[0].s) * 100}%;background:${catById(s.cat).color}"></i></span></div>`).join('')}</div></section>`;

  // Fisse e variabili + metodi di pagamento
  {
    const fixed = st.ex.filter(isFixed).reduce((s, t) => s + cost(t), 0), variable = st.spent - fixed;
    const meth = { carta: 0, contanti: 0, bonifico: 0 }; for (const t of st.ex) if (meth[t.method] != null) meth[t.method] += cost(t);
    const mtot = Object.values(meth).reduce((a, b) => a + b, 0);
    const MC = { carta: '#2a78d6', contanti: '#eb6834', bonifico: '#1baf7a' };
    html += `<section class="card"><div class="card__head"><span class="card__title">Fisse e variabili</span></div>
      <div class="split2"><div><span class="label">🔒 Fisse</span><b class="num">${fmt(fixed)}</b><span class="label">affitto, abbonamenti, ricorrenti</span></div><div><span class="label">🛍️ Variabili</span><b class="num">${fmt(variable)}</b><span class="label">tutto il resto</span></div></div>
      <div class="stack" style="height:10px;margin-top:12px">${st.spent ? `<i style="flex:${fixed};background:var(--ink-3)"></i><i style="flex:${variable};background:var(--accent)"></i>` : ''}</div>
      <div class="card__title" style="margin:20px 0 10px">Come paghi</div>
      <div class="stack" style="height:10px">${Object.entries(meth).filter(([, v]) => v > 0).map(([k, v]) => `<i style="flex:${v};background:${MC[k]}"></i>`).join('')}</div>
      <div class="legend" style="flex-wrap:wrap">${Object.entries(meth).filter(([, v]) => v > 0).map(([k, v]) => `<span><i style="background:${MC[k]}"></i>${METHODS[k].slice(3)} ${pct(v, mtot)}% · ${fmt0(v)}</span>`).join('')}</div>
    </section>`;
  }
  html += '</div>';
  return html;
}

// Scheda di una categoria
function openCategory(id) {
  const c = catById(id), mk = monthKey(today());
  const months = Array.from({ length: 12 }, (_, i) => addMonths(mk, i - 11));
  const vals = months.map((m) => sumRange(m + '-01', endOfMonth(m), c.type, (t) => t.category === id));
  const fm = monthKey(firstDate());
  const done = vals.slice(0, -1).filter((v, i) => months[i] >= fm).slice(-6); // ultimi 6 mesi completi, anche quelli a zero
  const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0;
  const list = sortDesc(live().filter((t) => t.category === id));
  const total = list.reduce((s, t) => s + (t.type === 'expense' ? cost(t) : t.amount), 0);
  const lab = {};
  for (const t of list) { const l = t.merchant || t.note; if (!l) continue; const k = normKey(l); lab[k] = lab[k] || { l, n: 0, s: 0 }; lab[k].n++; lab[k].s += t.type === 'expense' ? cost(t) : t.amount; }
  const tops = Object.values(lab).sort((a, b) => b.s - a.s).slice(0, 5);
  const budget = state.data.settings.budgets?.[id];
  openSheet(`<div class="sheet__head"><h2 style="display:flex;align-items:center;gap:10px">${icon(c, true)}${esc(c.name)}</h2><button class="x" data-action="close-sheet" aria-label="Chiudi">${ICON.x}</button></div>
    <div class="summary" style="margin:6px 0 14px"><div><span class="label">Questo mese</span><b class="num">${fmt(vals[11])}</b></div><div><span class="label">Media al mese</span><b class="num">${fmt0(avg)}</b></div><div><span class="label">In tutto</span><b class="num">${fmt0(total)}</b><span class="label">${list.length} movimenti</span></div></div>
    ${budget ? `<div class="small" style="margin:-4px 2px 12px">🎯 Budget ${fmt0(budget)} al mese · usato il <b>${pct(vals[11], budget)}%</b></div>` : ''}
    <div class="card__title" style="margin-bottom:8px">Ultimi 12 mesi</div>
    ${barChart({ items: vals.map((v, i) => ({ label: MON3[Number(months[i].slice(5)) - 1], value: v, key: months[i], tip: `<b>${cap(monthName(months[i]))}</b><br>${fmt(v)}` })), height: 150, avg: avg || null, highlight: mk, labelEvery: 2 })}
    ${tops.length ? `<div class="card__title" style="margin:18px 0 10px">${c.type === 'income' ? 'Da chi' : 'Dove e cosa'}</div><div class="cats">${tops.map((x) => `<div class="catbar" style="grid-template-columns:1fr auto"><span class="catbar__name">${esc(x.l)}<span class="catbar__pct">${x.n} ${x.n === 1 ? 'volta' : 'volte'}</span></span><span class="catbar__val num">${fmt(x.s)}</span><span class="catbar__track" style="grid-column:1/3"><i style="width:${(x.s / tops[0].s) * 100}%;background:${c.color}"></i></span></div>`).join('')}</div>` : ''}
    <div class="card__title" style="margin:18px 0 4px">Ultimi movimenti</div>
    <div class="txs">${list.slice(0, 6).map((t) => txRow(t, { showDate: true })).join('') || '<span class="muted small">Nessun movimento.</span>'}</div>
    <div class="row" style="margin-top:14px">${c.type === 'expense' ? `<button class="btn" data-action="budget" data-cat="${id}">🎯 Budget</button>` : ''}<button class="btn btn--primary" data-action="filter-cat" data-cat="${id}">Tutti i movimenti</button></div>`, 'cat');
}

// ---------- Doppioni ----------
function looksDuplicate(a, b) {
  return a.id !== b.id && a.type === b.type && Math.abs(a.amount - b.amount) < 0.005 && Math.abs(daysBetween(a.date, b.date)) <= 1
    && (a.category === b.category || (a.merchant && b.merchant && normKey(a.merchant) === normKey(b.merchant)))
    && !(a.note && b.note && normKey(a.note) !== normKey(b.note)); // note diverse = due cose diverse
}
const findDuplicate = (t) => sortDesc(live()).find((x) => looksDuplicate(t, x));
function duplicatePairs() {
  const groups = {};
  for (const t of live()) (groups[t.type + '|' + t.amount.toFixed(2)] = groups[t.type + '|' + t.amount.toFixed(2)] || []).push(t);
  const pairs = [];
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length && daysBetween(g[i].date, g[j].date) <= 1; j++) {
      const [a, b] = [g[i], g[j]];
      if (looksDuplicate(a, b) && !a.okDup && !b.okDup) pairs.push([a, b]);
    }
  }
  return pairs.sort((x, y) => (x[1].date < y[1].date ? 1 : -1));
}
function showDupDialog(t, dup) {
  const when = dup.date === t.date ? 'lo stesso giorno' : dup.date < t.date ? 'il giorno prima' : 'il giorno dopo';
  const d = $('#dialog');
  d.innerHTML = `<div class="dialog__bg"></div><div class="dialog__box" role="alertdialog" aria-modal="true">
    <div class="dialog__ic">⚠️</div>
    <h3>Forse l'hai già inserita</h3>
    <p>C'è già ${t.type === 'income' ? 'un\'entrata' : 'una spesa'} di <b>${fmt(t.amount)}</b> in <b>${esc(catById(t.category).name)}</b> ${when}:</p>
    <div class="dialog__tx">${txRow(dup, { showDate: true }).replace('data-action="edit"', 'disabled')}</div>
    <button class="btn btn--primary btn--block" data-action="dup-cancel">Non aggiungerla</button>
    <button class="btn btn--block" style="margin-top:8px" data-action="dup-force">Aggiungi comunque</button>
    <button class="dialog__link" data-action="dup-back">Torna a modificare</button>
  </div>`;
  d.hidden = false; vibrate([30, 60, 30]);
}
const closeDialog = () => { const d = $('#dialog'); d.hidden = true; d.innerHTML = ''; };
function viewDoppioni() {
  const pairs = duplicatePairs();
  return `${backLink}<header class="top"><div><div class="sub">Spese inserite due volte?</div><h1>Doppioni</h1></div></header>
  <p class="note" style="margin:-6px 4px 14px">Qui trovi le coppie di movimenti con lo stesso importo e la stessa categoria (o lo stesso negozio), a distanza di al massimo un giorno. Se sono davvero due spese diverse tocca <b>Non è un doppione</b>.</p>
  ${pairs.length ? pairs.map(([a, b]) => `<section class="card" style="margin-bottom:12px;padding:10px 12px"><div class="txs">${txRow(a, { showDate: true })}${txRow(b, { showDate: true })}</div>
    <div class="row" style="margin-top:8px"><button class="btn btn--sm" data-action="dup-ok" data-id="${b.id}">Non è un doppione</button><button class="btn btn--sm btn--danger" data-action="dup-del" data-id="${b.id}">Elimina il secondo</button></div></section>`).join('')
  : '<div class="card empty"><div class="big">✅</div><h3>Nessun doppione</h3><p>Non ho trovato spese inserite due volte.</p></div>'}`;
}

function viewAltro(sub) {
  if (sub === 'budget') return viewBudget();
  if (sub === 'ricorrenti') return viewRicorrenti();
  if (sub === 'condivise') return viewCondivise();
  if (sub === 'sync') return viewSync();
  if (sub === 'backup') return viewBackup();
  if (sub === 'doppioni') return viewDoppioni();
  const bal = balances(); const nBal = Object.values(bal).filter((b) => Math.abs(b.amount) > 0.004).length;
  const nBud = Object.values(state.data.settings.budgets || {}).filter((v) => v > 0).length;
  const nRec = (state.data.settings.recurring || []).filter((r) => r.active).length;
  const theme = store.get('flowa:theme', 'auto');
  const nDup = duplicatePairs().length;
  const item = (href, ic, title, sub2, end = '') => `<a class="item" href="${href}"><span class="ic">${ic}</span><span class="item__main"><span class="item__title">${title}</span><span class="item__sub">${sub2}</span></span><span class="item__end">${end}${ICON.chev}</span></a>`;
  return `
  <header class="top"><div><div class="sub">Strumenti e impostazioni</div><h1>Altro</h1></div></header>
  <div class="list">
    ${item('#/altro/budget', '🎯', 'Budget', 'Un tetto mensile per categoria', nBud ? nBud + ' attivi' : '')}
    ${item('#/altro/ricorrenti', '↻', 'Spese ricorrenti', 'Affitto, abbonamenti, corsi…', nRec ? nRec + ' attive' : '')}
    ${item('#/altro/condivise', '÷', 'Spese condivise', 'Chi ti deve soldi e a chi li devi', nBal ? nBal + ' aperte' : '')}
    ${item('#/altro/doppioni', '⧉', 'Controlla doppioni', 'Spese inserite due volte per sbaglio', nDup ? `<span class="pill pill--bad">${nDup}</span>` : '')}
  </div>
  <div class="section-t">Dati</div>
  <div class="list">
    ${item('#/altro/sync', '☁️', 'Sincronizzazione', state.sync.lastSync && state.syncStatus === 'ok' ? `Sincronizzato · ${new Date(state.sync.lastSync).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : syncText(), state.sync.token ? `<span class="sdot" data-s="${state.syncStatus}"></span>` : 'Da collegare')}
    ${item('#/altro/backup', '💾', 'Backup ed esportazione', 'Scarica una copia o esporta per Excel')}
  </div>
  <div class="section-t">Aspetto</div>
  <div class="list"><div class="item"><span class="ic">🌗</span><span class="item__main"><span class="item__title">Tema</span></span>
    <div class="seg">${[['auto', 'Auto'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([k, l]) => `<button class="${theme === k ? 'on' : ''}" data-action="theme" data-v="${k}">${l}</button>`).join('')}</div></div></div>
  <p class="small muted" style="text-align:center;margin-top:24px">Flowa · versione ${APP_VERSION.replace('flowa-', '')}</p>`;
}
const backLink = `<a class="back" href="#/altro">${ICON.back}Altro</a>`;

function viewBudget() {
  const t = today(), mk = monthKey(t);
  const budgets = state.data.settings.budgets || {};
  const spentBy = Object.fromEntries(byCategory(mk + '-01', t, 'expense'));
  const avgBy = {}; // media degli ultimi 3 mesi completi, per suggerire un valore
  for (let i = 1; i <= 3; i++) for (const [id, v] of byCategory(addMonths(mk, -i) + '-01', endOfMonth(addMonths(mk, -i)), 'expense')) avgBy[id] = (avgBy[id] || 0) + v / 3;
  const list = cats().filter((c) => c.type === 'expense');
  const withB = list.filter((c) => budgets[c.id] > 0), without = list.filter((c) => !(budgets[c.id] > 0));
  const dayN = parse(t).getDate(), daysIn = Number(endOfMonth(mk).slice(8));
  const row = (c) => {
    const b = budgets[c.id], s = spentBy[c.id] || 0, p = pct(s, b);
    return `<button class="item" data-action="budget" data-cat="${c.id}">${icon(c)}<span class="item__main"><span class="row" style="justify-content:space-between"><span class="item__title">${esc(c.name)}</span><span class="small num" style="flex:none"><b>${fmt0(s)}</b> <span class="muted">/ ${fmt0(b)}</span></span></span>
      <div class="progress"><i class="${p >= 100 ? 'over' : p >= 80 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></i></div>
      <span class="item__sub">${p >= 100 ? `Superato di ${fmt(s - b)}` : `Restano ${fmt(b - s)} · circa ${fmt0((b - s) / Math.max(1, daysIn - dayN + 1))} al giorno`}</span></span></button>`;
  };
  return `${backLink}<header class="top"><div><div class="sub">${cap(monthName(mk))}</div><h1>Budget</h1></div></header>
  <p class="note" style="margin:-6px 4px 14px">Scegli quanto vuoi spendere al massimo ogni mese in una categoria. La barra diventa arancione all'80% e rossa quando sfori. In Home vedrai un piccolo riepilogo.</p>
  ${withB.length ? `<div class="list">${withB.map(row).join('')}</div>` : ''}
  <div class="section-t">${withB.length ? 'Aggiungi un budget' : 'Scegli una categoria'}</div>
  <div class="list">${without.map((c) => `<button class="item" data-action="budget" data-cat="${c.id}">${icon(c)}<span class="item__main"><span class="item__title">${esc(c.name)}</span><span class="item__sub">${avgBy[c.id] ? `Di solito spendi circa ${fmt0(avgBy[c.id])} al mese` : 'Nessuna spesa negli ultimi mesi'}</span></span><span class="item__end">Imposta${ICON.chev}</span></button>`).join('')}</div>`;
}

const freqText = (r) => (r.freq === 'weekly' ? `Ogni ${WD[r.day]}` : Number(r.day) === -1 ? 'Ogni mese, l\'ultimo giorno' : `Ogni mese, il giorno ${r.day}`);
function viewRicorrenti() {
  const rules = state.data.settings.recurring || [];
  const monthly = rules.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + (r.freq === 'weekly' ? (r.amount * 52) / 12 : r.amount), 0);
  return `${backLink}<header class="top"><div><div class="sub">Si aggiungono da sole</div><h1>Ricorrenti</h1></div></header>
  <p class="note" style="margin:-6px 4px 14px">Flowa inserisce queste spese (o entrate) da sola, nel giorno giusto. Se una volta non c'è stata, basta eliminarla dai movimenti.</p>
  ${rules.length ? `<div class="summary" style="margin-bottom:14px"><div><span class="label">Costo fisso al mese (circa)</span><b class="num">${fmt(monthly)}</b></div></div>` : ''}
  <div class="list">${rules.map((r) => { const c = catById(r.category); return `<div class="item">${icon(c)}<button class="item__main" style="text-align:left" data-action="rec-edit" data-id="${r.id}"><span class="item__title">${esc(r.note || r.merchant || c.name)}</span><span class="item__sub">${freqText(r)} · ${r.type === 'income' ? '+' : ''}${fmt(r.amount)} · dal ${shortDate(r.start)}</span></button><button class="switch ${r.active ? 'on' : ''}" data-action="rec-toggle" data-id="${r.id}" aria-label="Attiva o disattiva"></button></div>`; }).join('') || '<div class="item muted">Nessuna spesa ricorrente.</div>'}</div>
  <button class="btn btn--block" style="margin-top:14px" data-action="rec-edit">＋ Nuova ricorrente</button>`;
}

function viewCondivise() {
  const bal = balances();
  const open = Object.entries(bal).filter(([, b]) => Math.abs(b.amount) > 0.004);
  const settled = sortDesc(live().filter((t) => t.split && t.split.settled)).slice(0, 20);
  return `${backLink}<header class="top"><div><div class="sub">Conti con amici e coinquilini</div><h1>Condivise</h1></div></header>
  <p class="note" style="margin:-6px 4px 14px">Quando aggiungi una spesa tocca <b>÷ Dividi</b> e scegli con chi. Nei tuoi totali conta solo la tua parte; qui vedi chi deve cosa.</p>
  ${open.length ? open.map(([p, b]) => `<section class="card" style="margin-bottom:12px">
      <div class="card__head"><span class="card__title">${esc(p)}</span><span class="num" style="font-weight:600;font-size:18px;color:${b.amount > 0 ? 'var(--income)' : 'var(--danger)'}">${fmt(Math.abs(b.amount))}</span></div>
      <div class="small muted" style="margin:-8px 0 8px">${b.amount > 0 ? `${esc(p)} ti deve questi soldi` : `Devi questi soldi a ${esc(p)}`}</div>
      <div class="txs">${sortDesc(b.txs).map((t) => txRow(t, { showDate: true })).join('')}</div>
      <button class="btn btn--sm btn--block" style="margin-top:10px" data-action="settle" data-p="${esc(p)}">✓ Segna tutto come saldato</button></section>`).join('')
    : '<div class="card empty"><div class="big">🤝</div><h3>Nessun conto aperto</h3><p>Tutto in pari con tutti.</p></div>'}
  ${settled.length ? `<div class="section-t">Già saldate</div><section class="card card--flat" style="padding:6px 10px"><div class="txs">${settled.map((t) => txRow(t, { showDate: true })).join('')}</div></section>` : ''}`;
}

function viewSync() {
  const s = state.sync;
  const status = `<section class="card" style="margin-bottom:14px"><div class="row"><span style="flex:1"><div class="card__title">${syncText()}</div><div class="small muted">${s.token ? `Archivio <b>${esc(s.repo)}</b>${s.lastSync ? ' · ultimo aggiornamento ' + new Date(s.lastSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : ''}` : 'I dati sono salvati solo in questo browser.'}</div>${state.syncStatus === 'err' ? `<div class="small" style="color:var(--danger);margin-top:6px">${esc(state.syncError)}</div>` : ''}</span>${syncBadge().replace('<span>' + syncText() + '</span>', '<span></span>')}</div></section>`;
  if (s.token) return `${backLink}<header class="top"><div><div class="sub">Telefono e computer sempre uguali</div><h1>Sincronizzazione</h1></div></header>${status}
    <button class="btn btn--primary btn--block" data-action="sync-now">Sincronizza ora</button>
    <p class="note" style="margin:14px 4px">Flowa si sincronizza da sola ogni volta che aggiungi o modifichi qualcosa e quando riapri l'app. I dati restano nel tuo archivio privato <b>${esc(s.repo)}</b>: solo tu puoi vederli.</p>
    <button class="btn btn--danger btn--block" data-action="sync-off">Scollega questo dispositivo</button>`;
  return `${backLink}<header class="top"><div><div class="sub">Telefono e computer sempre uguali</div><h1>Sincronizzazione</h1></div></header>${status}
  <section class="card"><div class="note">
    <p style="margin-top:0">Serve un <b>codice di accesso</b> di GitHub che può leggere e scrivere <b>solo</b> l'archivio privato <code>Flowa-dati</code>. Si fa una volta per ogni dispositivo (o lo copi):</p>
    <ol>
      <li>Apri <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--accent)">questa pagina di GitHub</a>.</li>
      <li><b>Token name</b>: scrivi <code>Flowa</code>. <b>Expiration</b>: scegli <i>No expiration</i> (o la durata che preferisci).</li>
      <li><b>Repository access</b>: <i>Only select repositories</i> → scegli <code>Flowa-dati</code>.</li>
      <li><b>Permissions</b> → <i>Repository permissions</i> → <b>Contents</b>: <i>Read and write</i>.</li>
      <li>Premi <b>Generate token</b>, copia il codice (inizia con <code>github_pat_</code>) e incollalo qui sotto.</li>
    </ol></div>
    <label class="field" style="margin-top:14px"><span>Codice di accesso</span><input class="input" id="tok" type="password" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="field"><span>Archivio</span><input class="input" id="repo" value="${esc(s.repo || 'l0renx0/Flowa-dati')}" autocomplete="off"></label>
    <button class="btn btn--primary btn--block" data-action="sync-on">Collega</button>
  </section>`;
}

function viewBackup() {
  return `${backLink}<header class="top"><div><div class="sub">Una copia sempre a portata</div><h1>Backup</h1></div></header>
  <div class="list">
    <button class="item" data-action="export-json"><span class="ic">💾</span><span class="item__main"><span class="item__title">Scarica un backup</span><span class="item__sub">Un file con tutto (movimenti e impostazioni)</span></span>${ICON.chev}</button>
    <button class="item" data-action="export-csv"><span class="ic">📊</span><span class="item__main"><span class="item__title">Esporta per Excel</span><span class="item__sub">File CSV con tutti i movimenti</span></span>${ICON.chev}</button>
    <label class="item" style="cursor:pointer"><span class="ic">📥</span><span class="item__main"><span class="item__title">Importa un backup</span><span class="item__sub">Unisce i movimenti del file con quelli che hai già</span></span>${ICON.chev}<input type="file" id="importFile" accept=".json,application/json" hidden></label>
  </div>`;
}

// ---------- Rendering ----------
let renderQueued = false;
function renderSoon() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(false); }); } }
function render(animate = true) {
  const r = route();
  const [tab, sub] = r.split('/');
  document.querySelectorAll('.tab[data-tab]').forEach((el) => el.classList.toggle('is-active', el.dataset.tab === tab));
  const v = $('#view');
  const html = tab === 'movimenti' ? viewMovimenti() : tab === 'analisi' ? viewAnalisi() : tab === 'altro' ? viewAltro(sub) : viewHome();
  const focused = document.activeElement?.id;
  const sel = focused === 'q' ? document.activeElement.selectionStart : null;
  v.innerHTML = html;
  if (animate) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; }
  if (focused === 'q' && $('#q')) { const q = $('#q'); q.focus(); q.setSelectionRange(sel, sel); }
  if (ui.an.open && tab === 'analisi' && ui.scrollTo) { document.getElementById('p-' + ui.an.open)?.scrollIntoView({ block: 'start' }); ui.scrollTo = false; }
}

// ---------- Pannello di inserimento ----------
// Due passaggi: 1) importo + suggeriti (il caso veloce), 2) dettagli (categoria, dove, quando, come, nota, dividi).
let draft = null;
function openAdd(t = null, preset = {}) {
  const lastMethod = sortDesc(live().filter((x) => x.method && x.type === 'expense'))[0]?.method || 'carta';
  draft = t
    ? { id: t.id, type: t.type, amt: String(t.amount).replace('.', ','), category: t.category, merchant: t.merchant || '', note: t.note || '', date: t.date, method: t.method || null, split: t.split ? { ...t.split } : null, orig: t, page: 2 }
    : { id: null, type: 'expense', amt: '', category: null, merchant: '', note: '', date: today(), method: lastMethod, split: null, page: 1, ...preset };
  $('#toast').hidden = true;
  openSheet(renderAdd(), 'add');
}
// L'importo può essere un piccolo calcolo, es. "3,20+4,50-1" (comodo per sommare più scontrini).
const hasOps = (a) => /[+-]/.test(a || '');
const draftAmount = () => round2((draft.amt || '').match(/[+-]?[^+-]+/g)?.reduce((s, t) => s + (Number(t.replace(',', '.')) || 0), 0) || 0);
const fmtTerm = (t) => { const [i, d] = t.split(','); return (i ? Number(i).toLocaleString('it-IT') : '0') + (t.includes(',') ? ',' + (d || '') : ''); };
function amountHtml() {
  const a = draft.amt || '';
  if (hasOps(a)) {
    const v = draftAmount();
    return `<span class="cur">€</span><span class="num">${fmt(Math.abs(v)).replace(/\s?€/, '')}</span>`;
  }
  return `<span class="cur">€</span><span class="num">${fmtTerm(a)}</span><span class="caret"></span>`;
}
const exprHtml = () => (hasOps(draft.amt) ? `${draft.amt.split(/([+-])/).map((t) => (t === '+' || t === '-' ? ` ${t === '-' ? '−' : '+'} ` : t ? fmtTerm(t) : '')).join('')}<span class="caret"></span> =` : '');

// Suggerimenti: le combinazioni (categoria + negozio, o categoria + nota ripetuta) che usi di più, pesate per quanto sono recenti.
const normKey = (s) => (s || '').trim().toLowerCase();
function suggestions(type) {
  const t0 = parse(today()).getTime(), nowH = new Date().getHours(), nowD = parse(today()).getDay();
  const map = new Map();
  for (const t of live()) {
    if (t.type !== type || t.recurring || t.date > today()) continue;
    const label = t.merchant || t.note || '';
    const key = t.category + '|' + normKey(label);
    const days = Math.max(0, (t0 - parse(t.date).getTime()) / 864e5);
    const s = map.get(key) || { key, category: t.category, label, isMerchant: !!t.merchant, score: 0, n: 0, amounts: [], method: null, last: '' };
    let w = Math.exp(-days / 75);
    if (t.createdAt) { const dh = Math.abs(new Date(t.createdAt).getHours() - nowH); if (Math.min(dh, 24 - dh) <= 2) w *= 1.6; } // a quest'ora lo fai spesso
    if (parse(t.date).getDay() === nowD) w *= 1.25;
    s.score += w; s.n++;
    if (t.date >= s.last) { s.last = t.date; s.method = t.method || s.method; s.label = label || s.label; }
    s.amounts.push([t.date, t.amount]);
    map.set(key, s);
  }
  let list = [...map.values()].filter((s) => s.label ? s.n >= 2 : true);
  list.sort((a, b) => b.score - a.score);
  list = list.slice(0, 10);
  // se ci sono poche combinazioni, aggiungo le categorie più usate da sole
  if (list.length < 6) {
    const u = usage(type);
    for (const c of cats().filter((c) => c.type === type).sort((a, b) => (u[b.id] || 0) - (u[a.id] || 0))) {
      if (list.length >= 6) break;
      if (!list.some((s) => s.category === c.id && !s.label)) list.push({ key: c.id + '|', category: c.id, label: '', amounts: [], score: 0 });
    }
  }
  for (const s of list) {
    const recent = s.amounts.sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5).map((x) => x[1]);
    s.fixed = recent.length >= 3 && recent.slice(0, 3).every((v) => v === recent[0]) ? recent[0] : null; // importo sempre uguale
    const sorted = [...recent].sort((a, b) => a - b);
    s.typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  }
  return list;
}
const suggestionOn = (s) => draft.category === s.category && (s.label ? normKey(s.isMerchant ? draft.merchant : draft.note) === normKey(s.label) : !draft.merchant);
function recentAmounts() {
  if (!draft.category) return [];
  const lab = normKey(draft.merchant || draft.note);
  const seen = new Set(), out = [];
  for (const t of sortDesc(live())) {
    if (t.type !== draft.type || t.category !== draft.category || (lab && normKey(t.merchant || t.note) !== lab)) continue;
    if (!seen.has(t.amount)) { seen.add(t.amount); out.push(t.amount); }
    if (out.length >= 3) break;
  }
  return out;
}
function usualCategory(merchant, type) {
  const n = {}; for (const t of live()) if (t.type === type && normKey(t.merchant) === normKey(merchant)) n[t.category] = (n[t.category] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
function merchantOptions() {
  const q = normKey(draft.merchant);
  const all = topMerchants(draft.type, null);
  const inCat = draft.category ? topMerchants(draft.type, draft.category) : all;
  const list = q ? all.filter((m) => normKey(m).includes(q) && normKey(m) !== q) : inCat;
  return list.slice(0, 8);
}
const merchantChips = () => merchantOptions().map((m) => `<button class="chip" data-action="d-merchant" data-v="${esc(m)}">${esc(m)}</button>`).join('');

function saveLabel(page) {
  const amount = draftAmount(); const d = draft;
  if (page === 1 && !d.category) return 'Avanti · scegli la categoria';
  if (page === 2 && !(amount > 0)) return 'Inserisci l\'importo';
  return (d.orig ? 'Salva modifiche' : d.type === 'income' ? 'Aggiungi entrata' : 'Aggiungi spesa') + (amount > 0 ? ' · ' + fmt(amount) : '');
}
function hintText() {
  const d = draft, o = d.orig;
  if (d.split) { const a = draftAmount(); return `La tua parte: ${fmt(d.split.mode === 'custom' ? Math.min(d.split.mine || 0, a) : round2(a / 2))}`; }
  if (o?.fixed) return o.fixed;
  if (o?.approx) return '≈ Data stimata durante l\'importazione dal foglio';
  if (o?.recurring) return '↻ Inserita in automatico (ricorrente)';
  return '';
}
function renderAdd() {
  return draft.page === 2 ? renderDetails() : renderAmount();
}
function renderAmount() {
  const d = draft; const isIn = d.type === 'income';
  const c = d.category ? catById(d.category) : null;
  const sug = suggestions(d.type);
  const amount = draftAmount();
  const what = c ? d.merchant || d.note || c.name : 'Categoria';
  const recent = recentAmounts();
  return `
  <div class="add add--p1">
    <div class="sheet__head">
      <div class="seg seg--type"><button class="${!isIn ? 'on' : ''}" data-action="d-type" data-v="expense">Spesa</button><button class="${isIn ? 'on' : ''}" data-action="d-type" data-v="income">Entrata</button></div>
      <button class="x" data-action="close-sheet" aria-label="Chiudi">${ICON.x}</button>
    </div>
    <div class="amount"><div class="amount__expr num" id="expr">${exprHtml()}</div><div class="amount__v ${!d.amt ? 'zero' : ''} ${isIn ? 'in' : ''}" id="amt">${amountHtml()}</div>
      <div class="amount__hint" id="hint">${esc(hintText())}</div>
      ${recent.length ? `<div class="recent" id="recent" ${d.amt ? 'hidden' : ''}><span class="muted">Le ultime volte:</span>${recent.map((v) => `<button class="chip" data-action="d-amt" data-v="${v}">${fmt(v)}</button>`).join('')}</div>` : ''}</div>
    <div class="facts">
      <button class="fact fact--main ${c ? '' : 'fact--empty'}" data-action="d-page" data-v="2">${c ? icon(c) : '<span class="ic">＋</span>'}<span class="fact__txt">${esc(what)}</span>${ICON.chev}</button>
      <span class="fact datewrap">📅 ${shortDate(d.date)}<input type="date" id="dDate" value="${d.date}" aria-label="Data"></span>
      <button class="fact" data-action="d-method">${METHODS[d.method] || '💳 Metodo'}</button>
    </div>
    ${sug.length ? `<div class="add__label"><span>Suggeriti</span><span class="muted">tocca per compilare</span></div>
    <div class="sugs">${sug.map((s) => { const sc = catById(s.category); return `<button class="sug ${suggestionOn(s) ? 'on' : ''}" style="--c:${sc.color}" data-action="d-sug" data-k="${esc(s.key)}">
        <span class="sug__ic">${sc.icon}</span><span class="sug__name">${esc(s.label || sc.name)}</span><span class="sug__sub">${s.label ? esc(sc.name) : 'Categoria'}</span>${s.fixed ? `<span class="sug__amt num">${fmt(s.fixed)}</span>` : ''}</button>`; }).join('')}</div>` : ''}
    <div class="keypad keypad--4" id="keypad">${['1', '2', '3', 'del', '4', '5', '6', '+', '7', '8', '9', '-', ',', '0', 'C', '='].map((k) => `<button class="key${/[+\-=C]|del/.test(k) ? ' key--op' : ''}" data-key="${k}" aria-label="${{ del: 'Cancella', C: 'Azzera', '-': 'Meno', '+': 'Più', '=': 'Uguale' }[k] || k}">${k === 'del' ? ICON.del : k === '-' ? '−' : k}</button>`).join('')}</div>
    <button class="btn btn--primary btn--block ${isIn ? 'btn--income' : ''}" id="saveBtn" data-action="d-save" data-page="1" ${amount > 0 ? '' : 'disabled'}>${saveLabel(1)}</button>
  </div>`;
}
function renderDetails() {
  const d = draft; const isIn = d.type === 'income';
  const list = cats().filter((c) => c.type === d.type);
  const ppl = people();
  const amount = draftAmount();
  const t = today(), y = addDays(t, -1);
  const other = d.date !== t && d.date !== y;
  return `
  <div class="add add--p2">
    <div class="sheet__head">
      <button class="back" data-action="d-page" data-v="1">${ICON.back}Importo</button>
      <button class="detail-amt num ${isIn ? 'in' : ''}" data-action="d-page" data-v="1">${amount > 0 ? fmt(amount) : '0,00 €'} <span>✎</span></button>
      <button class="x" data-action="close-sheet" aria-label="Chiudi">${ICON.x}</button>
    </div>
    ${hintText() ? `<div class="amount__hint" id="hint" style="text-align:center;margin:-2px 0 6px">${esc(hintText())}</div>` : '<div id="hint" class="amount__hint" style="text-align:center;min-height:0"></div>'}

    <div class="add__label"><span>Categoria</span></div>
    ${d.category && !d.catOpen ? `<button class="catpick" style="--c:${catById(d.category).color}" data-action="d-catopen"><span class="catbtn__ic">${catById(d.category).icon}</span><b>${esc(catById(d.category).name)}</b><span class="catpick__ch">Cambia</span></button>`
    : `<div class="catgrid" id="catGrid">${list.map((c) => `<button class="catbtn ${d.category === c.id ? 'on' : ''}" style="--c:${c.color}" data-action="d-cat" data-v="${c.id}"><span class="catbtn__ic">${c.icon}</span><span class="catbtn__name">${esc(c.name)}</span></button>`).join('')}<button class="catbtn catbtn--new" data-action="cat-new"><span class="catbtn__ic">＋</span><span class="catbtn__name">Nuova</span></button></div>
      ${d.newCat ? `<div class="newcat"><input class="input" id="ncIcon" maxlength="4" placeholder="🙂" value="${esc(d.newCatIcon || '')}" aria-label="Emoji"><input class="input" id="ncName" placeholder="Nome, es. Palestra" autocomplete="off" autocapitalize="sentences"><button class="btn btn--primary btn--sm" data-action="cat-create">Crea</button></div>` : ''}`}

    <div class="add__label"><span>${isIn ? 'Da chi' : 'Dove'}</span></div>
    <input class="input" id="dMerchant" placeholder="${isIn ? 'es. Velissima' : 'es. Aldi, Mercadona…'}" value="${esc(d.merchant)}" autocomplete="off" autocapitalize="words">
    <div class="chips chips--in" id="merchChips">${merchantChips()}</div>

    <div class="add__label"><span>Quando</span></div>
    <div class="chips chips--in">
      <button class="chip ${d.date === t ? 'on' : ''}" data-action="d-date" data-v="${t}">Oggi</button>
      <button class="chip ${d.date === y ? 'on' : ''}" data-action="d-date" data-v="${y}">Ieri</button>
      <span class="chip datewrap ${other ? 'on' : ''}">📅 ${other ? dayLabel(d.date) : 'Altro giorno'}<input type="date" id="dDate" value="${d.date}" aria-label="Scegli la data"></span>
    </div>

    <div class="add__label"><span>Come</span></div>
    <div class="seg seg--full">${Object.entries(METHODS).map(([k, l]) => `<button class="${d.method === k ? 'on' : ''}" data-action="d-method" data-v="${k}">${l}</button>`).join('')}</div>

    <div class="add__label"><span>Nota</span><span class="muted">facoltativa</span></div>
    <input class="input" id="dNote" placeholder="es. cena con Marco" value="${esc(d.note)}" autocomplete="off">

    ${!isIn ? `<button class="splitrow" data-action="d-split"><span><b>÷ Dividi con qualcuno</b><span class="small muted">Nei totali conta solo la tua parte</span></span><span class="switch ${d.split ? 'on' : ''}"></span></button>` : ''}
    ${d.split ? `<div class="split">
      <input class="input" id="sPerson" placeholder="Con chi?" value="${esc(d.split.person || '')}" autocomplete="off" autocapitalize="words">
      ${ppl.length ? `<div class="chips chips--in" style="margin-top:8px">${ppl.map((p) => `<button class="chip ${d.split.person === p ? 'on' : ''}" data-action="s-person" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:10px"><span class="small muted">La mia parte</span><div class="seg" style="flex:none"><button class="${d.split.mode !== 'custom' ? 'on' : ''}" data-action="s-mode" data-v="half">Metà</button><button class="${d.split.mode === 'custom' ? 'on' : ''}" data-action="s-mode" data-v="custom">Importo</button></div></div>
      ${d.split.mode === 'custom' ? `<input class="input" id="sMine" inputmode="decimal" style="margin-top:8px" placeholder="Quanto è tuo? es. 10,00" value="${d.split.mine ? String(d.split.mine).replace('.', ',') : ''}">` : ''}
      <div class="row" style="margin-top:10px"><span class="small muted">Ha pagato</span><div class="seg" style="flex:none"><button class="${d.split.paidBy !== 'them' ? 'on' : ''}" data-action="s-paid" data-v="me">Io</button><button class="${d.split.paidBy === 'them' ? 'on' : ''}" data-action="s-paid" data-v="them">${esc(d.split.person || 'L\'altro')}</button></div></div>
    </div>` : ''}

    <div class="sheet__foot row">
      ${d.orig ? `<button class="btn btn--danger" style="flex:none;width:54px;padding:0" data-action="d-delete" aria-label="Elimina">🗑</button>` : ''}
      <button class="btn btn--primary btn--block ${isIn ? 'btn--income' : ''}" id="saveBtn" data-action="d-save" data-page="2">${saveLabel(2)}</button>
    </div>
  </div>`;
}
function rerenderAdd(slide) {
  const p = $('#sheetPanel'); const st = slide ? 0 : p.scrollTop;
  const sugScroll = $('.sugs')?.scrollLeft;
  const focus = document.activeElement?.id; const sel = focus && document.activeElement.selectionStart;
  p.innerHTML = renderAdd(); p.scrollTop = st;
  if (!slide && $('.sugs') && sugScroll != null) $('.sugs').scrollLeft = sugScroll;
  if (slide) $('.add').classList.add(slide);
  if (!slide && focus && document.getElementById(focus)) { const el = document.getElementById(focus); el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) {} }
}
function goPage(n) { readDraftInputs(); draft.page = n; rerenderAdd(n === 2 ? 'slide-l' : 'slide-r'); }
function updateAmountOnly() {
  const a = $('#amt'); if (!a) return;
  a.innerHTML = amountHtml(); a.classList.toggle('zero', !draft.amt);
  const ex = $('#expr'); if (ex) ex.innerHTML = exprHtml();
  const rc = $('#recent'); if (rc) rc.hidden = !!draft.amt;
  const b = $('#saveBtn');
  b.disabled = !(draftAmount() > 0);
  b.textContent = saveLabel(1);
  $('#hint').textContent = hintText();
}
function pressKey(k) {
  let a = draft.amt;
  const last = a.split(/[+-]/).pop();
  if (k === 'del') a = a.slice(0, -1);
  else if (k === 'C') a = '';
  else if (k === '=') { const v = draftAmount(); a = v > 0 ? String(v).replace('.', ',') : ''; }
  else if (k === '+' || k === '-') {
    if (!a) return shake();
    a = a.replace(/[+\-,]$/, '') + k;
  } else if (k === ',') { if (!last.includes(',')) a += last ? ',' : '0,'; }
  else {
    const [i, d] = last.split(',');
    if (d !== undefined && d.length >= 2) return shake();
    if (d === undefined && (i || '').replace(/^0+/, '').length >= 6) return shake();
    a = last === '0' ? a.slice(0, -1) + k : a + k;
  }
  draft.amt = a; vibrate(5); updateAmountOnly();
}
function shake() { const a = $('#amt') || $('.detail-amt'); if (!a) return; a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); vibrate(20); }
function readDraftInputs() {
  const m = $('#dMerchant'), n = $('#dNote'), sp = $('#sPerson'), sm = $('#sMine');
  if (m) draft.merchant = m.value.trim();
  if (n) draft.note = n.value.trim();
  if (draft.split && sp) draft.split.person = sp.value.trim();
  if (draft.split && sm) draft.split.mine = Number(sm.value.replace(',', '.')) || 0;
}
function saveDraft() {
  readDraftInputs();
  const d = draft; const amount = round2(draftAmount());
  if (!(amount > 0)) { if (d.page === 2) goPage(1); else shake(); return; }
  if (!d.category) {
    if (d.page === 1) { goPage(2); return; }
    $('#catGrid').animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
    $('#catGrid').scrollIntoView({ block: 'center', behavior: 'smooth' }); vibrate(20); return;
  }
  let split = null;
  if (d.type === 'expense' && d.split) {
    if (!d.split.person) { if (d.page !== 2) goPage(2); setTimeout(() => $('#sPerson')?.focus(), 50); return; }
    const mine = d.split.mode === 'custom' ? round2(Math.min(d.split.mine || 0, amount)) : round2(amount / 2);
    split = { person: d.split.person, mine, mode: d.split.mode || 'half', paidBy: d.split.paidBy || 'me', settled: !!d.split.settled };
  }
  const base = d.orig ? { ...d.orig } : { id: uid(), createdAt: nowIso() };
  const t = Object.assign(base, { type: d.type, amount, date: d.date, category: d.category, merchant: d.merchant || null, note: d.note || null, method: d.method || null, split });
  if (!split) delete t.split;
  if (d.orig && d.orig.date !== d.date) { delete t.approx; delete t.fixed; }
  if (!d.orig) {
    if (d.force) t.okDup = true;
    else { const dup = findDuplicate(t); if (dup) { showDupDialog(t, dup); return; } }
  }
  upsertTx(t);
  closeSheet(); vibrate(12); render(false);
  toast(`${d.orig ? 'Modificata' : d.type === 'income' ? 'Entrata aggiunta' : 'Spesa aggiunta'} · ${fmt(amount)}`, d.orig ? null : () => { t.deleted = true; upsertTx(t); render(false); });
  if (!d.orig) burst();
}

// Piccola animazione di conferma
function burst() {
  const b = document.querySelector('.tab--add .plus') || document.body; const r = b.getBoundingClientRect();
  const colors = ['#7c6cff', '#1baf7a', '#eda100', '#eb6834', '#e87ba4'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('i'); p.className = 'confetti'; p.style.background = colors[i % colors.length];
    p.style.left = r.left + r.width / 2 + 'px'; p.style.top = r.top + r.height / 2 + 'px'; document.body.appendChild(p);
    const a = Math.random() * Math.PI - Math.PI, dist = 50 + Math.random() * 70;
    p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => p.remove();
  }
}

// ---------- Pannelli generici ----------
let sheetKind = null;
function openSheet(html, kind) {
  sheetKind = kind;
  const s = $('#sheet'); s.classList.remove('closing'); $('#sheetPanel').innerHTML = html; s.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#sheetPanel').scrollTop = 0;
}
function closeSheet() {
  const s = $('#sheet'); if (s.hidden) return;
  s.classList.add('closing'); sheetKind = null; draft = null;
  setTimeout(() => { s.hidden = true; s.classList.remove('closing'); document.body.style.overflow = ''; }, 200);
}
// Trascina il pannello verso il basso per chiuderlo
(() => {
  const panel = $('#sheetPanel'); let y0 = null, dy = 0;
  panel.addEventListener('touchstart', (e) => {
    if (panel.scrollTop > 0 || e.target.closest('.keypad, .sugs, .chips, input, .catgrid, .hm')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none';
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null; panel.style.transition = 'transform .2s ease';
    if (dy > 110) { closeSheet(); setTimeout(() => { panel.style.transform = ''; panel.style.transition = ''; }, 230); }
    else panel.style.transform = '';
  });
})();
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast'); clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-action="undo">Annulla</button>' : ''}`; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  toast.undo = undo;
  toastTimer = setTimeout(() => { t.hidden = true; toast.undo = null; }, 4200);
}

function openBudget(catId) {
  const c = catById(catId); const b = state.data.settings.budgets?.[catId];
  openSheet(`<div class="sheet__head"><h2>${c.icon} ${esc(c.name)}</h2><button class="x" data-action="close-sheet">${ICON.x}</button></div>
    <p class="note" style="margin-top:0">Quanto vuoi spendere al massimo ogni mese?</p>
    <label class="field"><span>Budget mensile (€)</span><input class="input" id="bVal" inputmode="decimal" value="${b ? String(b).replace('.', ',') : ''}" placeholder="es. 250"></label>
    <div class="row">${b ? `<button class="btn btn--danger" data-action="budget-del" data-cat="${catId}">Rimuovi</button>` : ''}<button class="btn btn--primary" data-action="budget-save" data-cat="${catId}">Salva</button></div>`, 'budget');
  setTimeout(() => $('#bVal')?.focus(), 250);
}
function openRecurring(id) {
  const r = (state.data.settings.recurring || []).find((x) => x.id === id) || { id: null, type: 'expense', amount: '', category: 'abbonamenti', merchant: '', note: '', method: 'carta', freq: 'monthly', day: 1, start: today(), active: true };
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
  const days = [opt(-1, 'Ultimo giorno del mese', r.day), ...Array.from({ length: 28 }, (_, i) => opt(i + 1, `Il giorno ${i + 1}`, r.day))].join('');
  const wds = [1, 2, 3, 4, 5, 6, 0].map((i) => opt(i, cap(WD[i]), r.day)).join('');
  openSheet(`<div class="sheet__head"><h2>${r.id ? 'Modifica ricorrente' : 'Nuova ricorrente'}</h2><button class="x" data-action="close-sheet">${ICON.x}</button></div>
    <div class="row field"><label><span class="label">Tipo</span><select class="input" id="rType">${opt('expense', 'Spesa', r.type)}${opt('income', 'Entrata', r.type)}</select></label><label><span class="label">Importo (€)</span><input class="input" id="rAmt" inputmode="decimal" value="${r.amount ? String(r.amount).replace('.', ',') : ''}" placeholder="es. 9,99"></label></div>
    <label class="field"><span>Nome</span><input class="input" id="rNote" value="${esc(r.note || '')}" placeholder="es. Netflix"></label>
    <div class="row field"><label><span class="label">Categoria</span><select class="input" id="rCat">${cats().map((c) => opt(c.id, `${c.icon} ${c.name}`, r.category)).join('')}</select></label><label><span class="label">Metodo</span><select class="input" id="rMethod">${Object.entries(METHODS).map(([k, l]) => opt(k, l, r.method)).join('')}</select></label></div>
    <div class="row field"><label><span class="label">Ogni</span><select class="input" id="rFreq">${opt('monthly', 'Mese', r.freq)}${opt('weekly', 'Settimana', r.freq)}</select></label><label><span class="label">Quando</span><select class="input" id="rDay" data-m="${esc(days)}" data-w="${esc(wds)}">${r.freq === 'weekly' ? wds : days}</select></label></div>
    <label class="field"><span>A partire dal</span><input class="input" type="date" id="rStart" value="${r.start}"></label>
    <div class="row">${r.id ? `<button class="btn btn--danger" data-action="rec-del" data-id="${r.id}">Elimina</button>` : ''}<button class="btn btn--primary" data-action="rec-save" data-id="${r.id || ''}">Salva</button></div>`, 'rec');
  $('#rFreq').addEventListener('change', (e) => { const s = $('#rDay'); s.innerHTML = e.target.value === 'weekly' ? s.dataset.w : s.dataset.m; });
}

// ---------- Esportazione ----------
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Data', 'Tipo', 'Importo', 'La mia parte', 'Categoria', 'Dove/Da chi', 'Nota', 'Metodo', 'Divisa con'].map(q).join(';')];
  for (const t of sortDesc(live())) rows.push([t.date, t.type === 'income' ? 'Entrata' : 'Spesa', String(t.amount).replace('.', ','), String(t.type === 'expense' ? cost(t) : t.amount).replace('.', ','), catById(t.category).name, t.merchant, t.note, METHODS[t.method]?.slice(3) || '', t.split?.person || ''].map(q).join(';'));
  download(`flowa-movimenti-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------- Eventi ----------
document.addEventListener('click', async (e) => {
  const key = e.target.closest('.key');
  if (key) { pressKey(key.dataset.key); return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, v = el.dataset.v;
  switch (a) {
    case 'add': openAdd(); break;
    case 'close-sheet': closeSheet(); break;
    case 'reload': location.reload(); break;
    case 'undo': if (toast.undo) { toast.undo(); toast.undo = null; $('#toast').hidden = true; } break;
    case 'edit': { const t = live().find((x) => x.id === el.dataset.id); if (t) { e.preventDefault(); e.stopPropagation(); openAdd(t); } break; }
    // Inserimento
    case 'd-type': readDraftInputs(); if (draft.type !== v) { draft.type = v; draft.category = null; draft.merchant = ''; draft.note = ''; if (v === 'income') draft.split = null; } rerenderAdd(); break;
    case 'd-page': goPage(Number(v)); break;
    case 'd-amt': draft.amt = String(v).replace('.', ','); vibrate(5); updateAmountOnly(); break;
    case 'cat-new': readDraftInputs(); draft.newCat = !draft.newCat; rerenderAdd(); setTimeout(() => $('#ncName')?.focus(), 50); break;
    case 'cat-create': {
      const name = $('#ncName').value.trim(); if (!name) { $('#ncName').focus(); return; }
      const PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
      const list = state.data.settings.categories;
      const c = { id: 'c-' + uid(), name: cap(name), type: draft.type, icon: $('#ncIcon').value.trim() || '•', color: PAL[list.length % PAL.length] };
      state.data.settings.categories = [...list.filter((x) => x.id !== 'altro' && x.id !== 'altro-in'), c, ...list.filter((x) => x.id === 'altro' || x.id === 'altro-in')];
      touchSettings(); readDraftInputs(); draft.category = c.id; draft.newCat = false; draft.catOpen = false; rerenderAdd(); toast(`Categoria "${c.name}" creata`); break;
    }
    case 'd-sug': {
      readDraftInputs();
      const s = suggestions(draft.type).find((x) => x.key === el.dataset.k); if (!s) break;
      if (suggestionOn(s)) { draft.category = null; draft.merchant = ''; if (!s.isMerchant) draft.note = ''; }
      else {
        draft.category = s.category;
        draft.merchant = s.label && s.isMerchant ? s.label : '';
        draft.note = s.label && !s.isMerchant ? s.label : '';
        if (s.method) draft.method = s.method;
        if (!draft.amt && s.fixed) draft.amt = String(s.fixed).replace('.', ',');
      }
      vibrate(5); rerenderAdd(); break;
    }
    case 'd-cat': readDraftInputs(); draft.category = v; draft.catOpen = false; draft.newCat = false; vibrate(5); rerenderAdd(); break;
    case 'd-catopen': readDraftInputs(); draft.catOpen = true; rerenderAdd(); break;
    case 'd-merchant': {
      readDraftInputs(); draft.merchant = v;
      if (!draft.category) draft.category = usualCategory(v, draft.type);
      vibrate(5); rerenderAdd(); break;
    }
    case 'd-date': readDraftInputs(); draft.date = v; rerenderAdd(); break;
    case 'd-method': { readDraftInputs(); const k = Object.keys(METHODS); draft.method = v || k[(k.indexOf(draft.method) + 1) % k.length]; rerenderAdd(); break; }
    case 'd-split': readDraftInputs(); draft.split = draft.split ? null : { person: '', mode: 'half', paidBy: 'me', mine: 0 }; rerenderAdd(); if (draft.split) setTimeout(() => $('#sPerson')?.focus(), 50); break;
    case 's-person': readDraftInputs(); draft.split.person = v; rerenderAdd(); break;
    case 's-mode': readDraftInputs(); draft.split.mode = v; rerenderAdd(); if (v === 'custom') $('#sMine')?.focus(); break;
    case 's-paid': readDraftInputs(); draft.split.paidBy = v; rerenderAdd(); break;
    case 'd-save': saveDraft(); break;
    case 'dup-force': closeDialog(); draft.force = true; saveDraft(); break;
    case 'dup-cancel': closeDialog(); closeSheet(); toast('Ok, non l\'ho aggiunta'); break;
    case 'dup-back': closeDialog(); break;
    case 'dup-ok': { const t = live().find((x) => x.id === el.dataset.id); if (t) { upsertTx({ ...t, okDup: true }); render(false); toast('Segnato: non è un doppione'); } break; }
    case 'dup-del': { const t = live().find((x) => x.id === el.dataset.id); if (t) { const del = { ...t, deleted: true }; upsertTx(del); render(false); toast('Doppione eliminato', () => { upsertTx({ ...t }); render(false); }); } break; }
    case 'p-period': ui.an.pPeriod = v; saveUi(); render(false); break;
    case 'cat-detail': e.preventDefault(); openCategory(el.dataset.cat); break;
    case 'd-delete': { const t = { ...draft.orig, deleted: true }; upsertTx(t); closeSheet(); render(false); toast('Movimento eliminato', () => { delete t.deleted; upsertTx(t); render(false); }); break; }
    // Home
    case 'month': { const cur = monthKey(today()); const m = addMonths(ui.home.month || cur, Number(el.dataset.d)); ui.home.month = m >= cur ? null : m; render(false); break; }
    case 'recap-ok': e.preventDefault(); ui.recapSeen = addDays(weekStart(today()), -7); saveUi(); render(false); break;
    case 'open-week': ui.an.tab = 'settimane'; ui.an.open = el.dataset.ws; ui.scrollTo = true; ui.recapSeen = el.dataset.ws; saveUi(); break;
    // Movimenti
    case 'mov-type': ui.mov.type = v; ui.mov.cat = null; ui.mov.limit = 150; saveUi(); render(false); break;
    case 'mov-cat': ui.mov.cat = v || null; ui.mov.limit = 150; render(false); break;
    case 'more': ui.mov.limit += 150; render(false); break;
    case 'filter-cat': e.preventDefault(); ui.mov = { q: '', type: catById(el.dataset.cat).type, cat: el.dataset.cat, limit: 150 }; location.hash = '#/movimenti'; break;
    // Resoconti
    case 'an-tab': ui.an.tab = el.dataset.tab; ui.an.open = null; saveUi(); if (route() === 'analisi') render(false); break;
    case 'toggle': ui.an.open = ui.an.open === el.dataset.k ? null : el.dataset.k; render(false); break;
    case 'no-rent': ui.an.noRent = !ui.an.noRent; saveUi(); render(false); break;
    case 'cat-period': ui.an.catPeriod = v; saveUi(); render(false); break;
    case 'cat-type': ui.an.catType = v; saveUi(); render(false); break;
    // Altro
    case 'theme': if (v === 'auto') { store.del('flowa:theme'); delete document.documentElement.dataset.theme; } else { store.set('flowa:theme', v); document.documentElement.dataset.theme = v; } render(false); break;
    case 'budget': openBudget(el.dataset.cat); break;
    case 'budget-save': { const n = Number(($('#bVal').value || '').replace(',', '.')); if (!(n > 0)) { $('#bVal').focus(); return; } state.data.settings.budgets = { ...state.data.settings.budgets, [el.dataset.cat]: round2(n) }; touchSettings(); closeSheet(); render(false); break; }
    case 'budget-del': { const b = { ...state.data.settings.budgets }; delete b[el.dataset.cat]; state.data.settings.budgets = b; touchSettings(); closeSheet(); render(false); break; }
    case 'rec-edit': openRecurring(el.dataset.id); break;
    case 'rec-toggle': { const r = state.data.settings.recurring.find((x) => x.id === el.dataset.id); r.active = !r.active; if (r.active && r.start < today()) r.start = today(); touchSettings(); runRecurring(); render(false); break; }
    case 'rec-save': {
      const amount = round2(Number(($('#rAmt').value || '').replace(',', '.')));
      if (!(amount > 0)) { $('#rAmt').focus(); return; }
      const list = state.data.settings.recurring || [];
      const r = list.find((x) => x.id === el.dataset.id) || { id: uid(), active: true };
      Object.assign(r, { type: $('#rType').value, amount, note: $('#rNote').value.trim() || null, category: $('#rCat').value, method: $('#rMethod').value, freq: $('#rFreq').value, day: Number($('#rDay').value), start: $('#rStart').value || today() });
      if (!list.includes(r)) list.push(r);
      state.data.settings.recurring = list; touchSettings(); runRecurring(); closeSheet(); render(false); toast('Ricorrente salvata'); break;
    }
    case 'rec-del': state.data.settings.recurring = state.data.settings.recurring.filter((x) => x.id !== el.dataset.id); touchSettings(); closeSheet(); render(false); break;
    case 'settle': {
      const p = el.dataset.p; const ts = live().filter((t) => t.split && !t.split.settled && t.split.person === p);
      for (const t of ts) { t.split = { ...t.split, settled: true }; t.updatedAt = nowIso(); }
      persist(); render(false); toast(`Conto con ${p} saldato`, () => { for (const t of ts) { t.split = { ...t.split, settled: false }; t.updatedAt = nowIso(); } persist(); render(false); }); break;
    }
    case 'sync-on': {
      const token = $('#tok').value.trim(), repo = $('#repo').value.trim().replace(/^https:\/\/github\.com\//, '');
      if (!token) { $('#tok').focus(); return; }
      el.disabled = true; el.textContent = 'Collegamento…';
      try {
        await ghPull({ token, repo, path: 'data.json' });
        state.sync = { token, repo, path: 'data.json' }; store.set(SYNC_KEY, state.sync);
        await syncNow();
        if (state.syncStatus === 'ok') { toast('Collegato! I tuoi dati sono qui 🎉'); location.hash = '#/home'; } else render(false);
      } catch (err) { el.disabled = false; el.textContent = 'Collega'; state.syncError = err.message; toast(err.message); }
      break;
    }
    case 'sync-now': syncNow(); break;
    case 'sync-off': if (confirm('Scollegare questo dispositivo? I dati restano nell\'archivio su GitHub; da qui spariranno.')) { state.sync = {}; store.del(SYNC_KEY); state.data = emptyData(); persist(false); setSync('local'); location.hash = '#/home'; } break;
    case 'export-json': download(`flowa-backup-${today()}.json`, JSON.stringify(state.data, null, 1), 'application/json'); break;
    case 'export-csv': exportCsv(); break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { ui.mov.q = e.target.value; ui.mov.limit = 150; renderSoon(); }
  if (e.target.id === 'sMine' && draft?.split) { draft.split.mine = Number(e.target.value.replace(',', '.')) || 0; $('#hint').textContent = hintText(); }
  if (e.target.id === 'dMerchant' && draft) { draft.merchant = e.target.value.trim(); $('#merchChips').innerHTML = merchantChips(); }
  if (e.target.id === 'sPerson' && draft?.split) draft.split.person = e.target.value.trim();
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'dDate' && e.target.value) { readDraftInputs(); draft.date = e.target.value; rerenderAdd(); }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.transactions)) throw new Error();
      state.data = merge(state.data, d); persist(); runRecurring(); toast(`Importati ${d.transactions.length} movimenti`); location.hash = '#/home';
    } catch (err) { toast('Questo file non è un backup di Flowa'); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#dialog').hidden) { closeDialog(); return; }
  if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
  if (!$('#dialog').hidden) return;
  if (sheetKind !== 'add') {
    // scorciatoia da computer: "n" apre il pannello per una nuova spesa
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); openAdd(); }
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { if (e.key === 'Enter') { e.preventDefault(); saveDraft(); } return; }
  if (draft.page === 2) { if (e.key === 'Enter') { e.preventDefault(); saveDraft(); } return; }
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pressKey(e.key); }
  else if (e.key === ',' || e.key === '.') { e.preventDefault(); pressKey(','); }
  else if (e.key === '+' || e.key === '-') { e.preventDefault(); pressKey(e.key); }
  else if (e.key === '=') { e.preventDefault(); pressKey('='); }
  else if (e.key === 'Backspace') { e.preventDefault(); pressKey('del'); }
  else if (e.key === 'Enter') { e.preventDefault(); saveDraft(); }
});
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
window.addEventListener('online', () => syncNow());
window.addEventListener('offline', () => setSync('off'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkVersion();
  if (runRecurring()) render(false);
  if (Date.now() - lastSyncTry > 15000) syncNow();
});

// ---------- Aggiornamenti dell'app ----------
async function checkVersion() {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!res.ok) return;
    const v = await res.json();
    if (v.version && v.version !== APP_VERSION) $('#fresh').hidden = false;
  } catch (e) {}
}

// ---------- Avvio ----------
if (!location.hash) history.replaceState(null, '', '#/home');
runRecurring();
setSync(state.sync.token ? (navigator.onLine ? 'ok' : 'off') : 'local');
render();
if (state.sync.token) syncNow();
if (new URLSearchParams(location.search).has('nuova')) { history.replaceState(null, '', location.pathname + '#/home'); openAdd(); }
checkVersion();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
