// Flowa — importazione dei movimenti da file della banca (Excel, CSV, PDF) o da un backup di Flowa.
// Usa le funzioni e lo stato definiti in app.js. Le librerie per Excel e PDF si caricano solo quando servono.
'use strict';

const imp = { rows: [], map: null, items: [], file: '', kind: '' };

// ---------- Caricamento librerie (solo al primo uso) ----------
const loaded = {};
function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Non riesco a caricare ' + src)); document.head.appendChild(s); });
  return loaded[src];
}

// ---------- Lettura dei file ----------
function decodeText(buf) {
  let text = new TextDecoder('utf-8').decode(buf);
  if ((text.match(/�/g) || []).length > 3) text = new TextDecoder('windows-1252').decode(buf); // file "vecchio stile"
  return text.replace(/^﻿/, '');
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).slice(0, 20);
  const delims = [';', ',', '\t', '|'];
  const delim = delims.map((d) => [d, lines.reduce((s, l) => s + l.split(d).length - 1, 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
async function readSheet(buf) {
  await loadScript('assets/vendor/xlsx.full.min.js');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  let best = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    if (rows.length > best.length) best = rows;
  }
  return best.filter((r) => r.some((x) => String(x).trim()));
}
async function readPdf(buf) {
  await loadScript('assets/vendor/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const byY = new Map();
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      (byY.get(y) || byY.set(y, []).get(y)).push(it);
    }
    for (const [, items] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      items.sort((a, b) => a.transform[4] - b.transform[4]);
      lines.push(items.map((i) => i.str.trim()).join('  '));
    }
  }
  // Una riga è un movimento se inizia con una data e contiene almeno un importo.
  const year = String(new Date().getFullYear());
  const rows = [['Data', 'Descrizione', 'Importo']];
  const AMT = /[-−+]?\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})-?|[-−+]?\d+\.\d{2}-?/g;
  for (const l of lines) {
    const m = l.match(/^(\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?)\s+(.*)$/);
    if (!m) continue;
    let rest = m[2].replace(/^\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\s+/, ''); // seconda data (valuta)
    const amts = rest.match(AMT);
    if (!amts) continue;
    const amount = amts.length >= 2 ? amts[amts.length - 2] : amts[0]; // l'ultimo spesso è il saldo
    const desc = rest.slice(0, rest.indexOf(amts[0])).trim();
    if (!desc) continue;
    rows.push([m[1].split(/[\/.\-]/).length === 2 ? m[1] + '/' + year : m[1], desc, amount]);
  }
  return rows;
}

// ---------- Interpretazione di date e importi ----------
const MONTHS_ANY = { gen: 1, ene: 1, jan: 1, feb: 2, mar: 3, apr: 4, abr: 4, mag: 5, may: 5, giu: 6, jun: 6, lug: 7, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, sett: 9, ott: 10, oct: 10, nov: 11, dic: 12, dec: 12, dez: 12 };
function parseDate(v, mdy = false) {
  if (v instanceof Date && !isNaN(v)) return iso(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const s = String(v ?? '').trim().toLowerCase();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return mdy ? valid(y, +m[1], +m[2]) : valid(y, +m[2], +m[1]); }
  m = s.match(/^(\d{1,2})\s+([a-zà-ú]{3,4})[a-zà-ú.]*\s+(\d{2,4})/);
  if (m && MONTHS_ANY[m[2]]) { let y = +m[3]; if (y < 100) y += 2000; return valid(y, MONTHS_ANY[m[2]], +m[1]); }
  return null;
}
function valid(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 ? iso(dt) : null;
}
function parseAmount(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  let neg = /^[-−]|[-−]$|^\(.*\)$/.test(s);
  s = s.replace(/eur(o|os)?|€|\$|£/gi, '');
  if (/\p{L}/u.test(s)) return null; // contiene lettere: è un testo, non un importo
  s = s.replace(/[\s ()+\-−]/g, '');
  if (!/^\d[\d.,']*$/.test(s)) return null;
  s = s.replace(/'/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (ld >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

// ---------- Riconoscimento delle colonne ----------
const H = {
  date: /fecha|^data|date|datum|giorno|valuta|f\.\s?oper/i,
  desc: /concepto|descri|causale|detail|dettagl|movimiento|movimento|beneficiar|merchant|comercio|esercente|payee|^name|^nome|referencia|operaci|counterparty|controparte|text|testo/i,
  amount: /importe|importo|amount|monto|cantidad|valor|betrag|montant|^eur|euro/i,
  debit: /cargo|addebit|uscit|^dare|debit|débito|gasto|withdraw|paid out|spes/i,
  credit: /abono|accredit|entrat|avere|credit|crédito|ingreso|deposit|paid in|incass/i,
  balance: /saldo|balance|disponib|solde/i,
  skip: /fee|comisi|commission|currency|divisa|moneda|state|estado|stato|type|tipo|product|prodotto/i,
};
function analyze(rows) {
  // riga d'intestazione: quella (tra le prime 30) con più parole chiave riconosciute
  let headerIdx = -1, bestScore = 1;
  rows.slice(0, 30).forEach((r, i) => {
    const sc = r.filter((c) => typeof c === 'string' && c.length < 40 && [H.date, H.desc, H.amount, H.debit, H.credit, H.balance].some((re) => re.test(c.trim()))).length;
    if (sc > bestScore) { bestScore = sc; headerIdx = i; }
  });
  const head = headerIdx >= 0 ? rows[headerIdx].map((c) => String(c).trim()) : [];
  const data = rows.slice(headerIdx + 1).filter((r) => r.some((c) => parseDate(c)) && r.some((c) => parseAmount(c) != null));
  const ncol = Math.max(0, ...rows.map((r) => r.length));
  const cols = Array.from({ length: ncol }, (_, i) => {
    const vals = data.map((r) => r[i]).filter((v) => String(v ?? '').trim() !== '');
    const n = Math.max(1, data.length);
    return {
      i, head: head[i] || `Colonna ${i + 1}`,
      dates: data.filter((r) => parseDate(r[i])).length / n,
      nums: data.filter((r) => typeof r[i] !== 'object' && parseAmount(r[i]) != null && !parseDate(r[i])).length / Math.max(1, vals.length),
      filled: vals.length / n,
      len: vals.reduce((s, v) => s + String(v).length, 0) / Math.max(1, vals.length),
      neg: data.some((r) => (parseAmount(r[i]) || 0) < 0),
    };
  });
  const hd = (re, c) => re.test(c.head) && !(re !== H.balance && H.balance.test(c.head));
  const dateC = cols.find((c) => c.dates > 0.8 && hd(H.date, c)) || cols.find((c) => c.dates > 0.8);
  const numeric = cols.filter((c) => c !== dateC && c.nums > 0.8 && !H.balance.test(c.head) && !H.skip.test(c.head));
  const debitC = cols.find((c) => c !== dateC && hd(H.debit, c) && c.nums > 0.8);
  const creditC = cols.find((c) => c !== dateC && c !== debitC && hd(H.credit, c) && c.nums > 0.8);
  let amountC = numeric.find((c) => hd(H.amount, c) && c.filled > 0.8) || (!(debitC && creditC) ? numeric.find((c) => c.filled > 0.8) : null);
  const descC = cols.filter((c) => c !== dateC && c !== amountC && c.nums < 0.5 && hd(H.desc, c)).sort((a, b) => b.len - a.len)[0]
    || cols.filter((c) => c !== dateC && c !== amountC && c.nums < 0.5).sort((a, b) => b.len - a.len)[0];
  const useSplit = !amountC && debitC && creditC;
  const anyNeg = amountC ? amountC.neg : false;
  // date americane (mese/giorno)? solo se nessun "giorno" supera 12 ma qualche "mese" sì
  const mdy = dateC ? data.some((r) => /^\d{1,2}[\/.\-](1[3-9]|2\d|3[01])[\/.\-]/.test(String(r[dateC.i]))) && !data.some((r) => /^(1[3-9]|2\d|3[01])[\/.\-]/.test(String(r[dateC.i]))) : false;
  return {
    headerIdx, cols, data,
    date: dateC?.i ?? null, desc: descC?.i ?? null,
    mode: useSplit ? 'split' : 'single', amount: amountC?.i ?? null, debit: debitC?.i ?? null, credit: creditC?.i ?? null,
    sign: useSplit ? 'split' : anyNeg ? 'neg' : 'allexp', mdy,
  };
}

// ---------- Negozio, categoria, metodo ----------
const RULES = [
  ['spesa', /mercadona|aldi|lidl|condis|\bdia\b|carrefour|spar\b|caprabo|bonpreu|bon preu|eroski|alcampo|consum|coop|esselunga|conad|supermerc|ameztoi|sorli|veritas|ametller|keisy|supersol|hiper/],
  ['uscite', /glovo|just ?eat|uber ?eats|deliveroo|restaur|pizz|burger|mcdonald|kfc|bar\b|cafe|caf[eè]|bodega|taberna|cervece|tapas|sushi|kebab|telepizza|starbucks|five guys|domino|horno|forn|panader|paster|gelat/],
  ['trasporti', /\bvoi\b|bicing|tmb|renfe|fgc|\btram\b|metro|uber(?! ?eats)|cabify|bolt|lime|cooltra|taxi|freenow|free now|parking|aparcam|gasolin|repsol|cepsa|shell|bp\b|trenitalia|italo|autobus|alsa|blablacar/],
  ['viaggi', /ryanair|vueling|easyjet|iberia|\bita airways|airbnb|booking|hotel|hostel|expedia|wizz|aena|aeropuerto|aeroporto/],
  ['abbonamenti', /netflix|spotify|disney|apple\.com|icloud|itunes|chatgpt|openai|claude|anthropic|amazon prime|prime video|youtube|google (one|storage)|dazn|hbo|max\.com|movistar|vodafone|orange|digi\b|lowi|o2|simyo|pepephone|fibra|gym|gimnas|palestra|dazn/],
  ['abbigliamento', /zara|primark|h&m|h & m|pull ?& ?bear|bershka|stradivarius|mango|decathlon|uniqlo|nike|adidas|foot ?locker|jd sports|kiabi|lefties|massimo dutti|zalando|shein|vinted/],
  ['casa', /ikea|action\b|bazar|leroy|bricomart|bricolaje|ferreter|mediamarkt|media markt|fnac|tiger|normal\b|maxi ?dia|casa\b|endesa|iberdrola|naturgy|aigues|agua|luz\b|gas natural/],
  ['cura', /farmacia|pharma|parafarm|druni|primor|sephora|perfum|peluquer|barber|parrucch|dentist|clinica|medic|doctor|ottic|optica/],
  ['svago', /cine|cinema|teatro|museu|museo|concert|ticketmaster|entradas|discotec|club|razzmatazz|apolo|steam|playstation|xbox|nintendo|libreria|llibreria|casino/],
  ['regali', /regalo|gift|flor|fiori|floristeria/],
  ['corsi', /academia|escuela|udemy|coursera|curso|corso|universit/],
];
const RULES_IN = [
  ['stipendio', /n[oó]mina|salario|salary|stipendio|payroll|sueldo/],
  ['famiglia', /mamma|pap[aà]|madre|padre|famil/],
  ['vendite', /wallapop|vinted|venta|vendita|ebay/],
];
const TRANSFER = /top[- ]?up|ricarica|recarga|traspaso|giroconto|transfer to |transfer from |to pocket|from pocket|savings|vault|salvadanaio|hucha|exchanged|cambio a |entre cuentas|cuenta propia/i;
function cleanDesc(s) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b\d{4}[x*]{4,}\d{0,4}\b/gi, '') // numero di carta mascherato
    .replace(/^(transferencia|transfer|bonifico|giroconto|bizum|ingreso|payment|pago|pagamento)(\s+(bizum|sepa|inmediata|istantaneo|recibid[ao]|ricevuto))*\s+(de|da|from|del|dal|a favor de)\s+/i, '')
    .replace(/^(transferencia|bonifico|bizum)\s+/i, '');
  t = t.replace(/^(compra|pago|pagamento|payment|card payment|purchase|adeudo|cargo|recibo|transacci[oó]n|operaci[oó]n)\s+(en|con|tarj(eta)?\.?|carta|pos|movil|m[oó]vil|bizum|contactless|apple ?pay|google ?pay)?\s*/i, '')
    .replace(/^(tarj(eta)?\.?|carta|pos|apple ?pay|google ?pay|contactless|en)\s+/i, '')
    .replace(/\b(tarj(eta)?|card|carta)\.?\s*[x*\d]{4,}\b/gi, '')
    .replace(/[x*]{2,}\d{2,}/gi, '').replace(/\b\d{6,}\b/g, '')
    .replace(/\b\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?\b/g, '')
    .replace(/\s+(es|esp|it|ita|spain|españa|barcelona|bcn|madrid|milano|roma)\b.*$/i, '')
    .replace(/\.(com|es|it|eu|net)\b/gi, '').replace(/[,;:\-–]+$/, '').replace(/\s+/g, ' ').trim();
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s\-'(.])\p{L}/gu, (m) => m.toUpperCase());
  return t.slice(0, 40) || String(s ?? '').trim().slice(0, 40);
}
function guess(desc, type) {
  const merchant = cleanDesc(desc);
  const low = ' ' + String(desc).toLowerCase() + ' ';
  const k = normKey(merchant);
  // 1. un negozio che hai già usato: stessa categoria e stesso nome
  let known = null;
  if (k.length >= 3) for (const t of live()) {
    const tk = normKey(t.merchant || '');
    if (t.type === type && tk.length >= 3 && (k.includes(tk) || tk.includes(k))) { known = t; break; }
  }
  const method = /transfer|transf\.|payment from|pago de|bizum|bonific|sepa|domicil|adeudo|recibo|direct debit/i.test(desc) ? 'bonifico' : 'carta';
  const rules = type === 'income' ? RULES_IN : RULES;
  const r = rules.find(([, re]) => re.test(low));
  // per le entrate la parola chiave (es. "stipendio") conta più del nome di chi paga
  if (known) return { merchant: known.merchant, category: (type === 'income' && r ? r[0] : null) || usualCategory(known.merchant, type) || known.category, method, transfer: TRANSFER.test(desc) };
  // 2. regole per parole chiave
  return { merchant, category: r ? r[0] : type === 'income' ? 'altro-in' : 'altro', method, transfer: TRANSFER.test(desc) };
}

// ---------- Dai dati ai movimenti proposti ----------
const SKIP_ROW = /^(reverted|declined|failed|rechazad|anulad|annullat|pending|pendiente)$/i;
function buildItems() {
  const m = imp.map;
  const keys = new Set(live().map((t) => t.importKey).filter(Boolean));
  imp.items = [];
  for (const r of m.data) {
    if (r.some((c) => SKIP_ROW.test(String(c).trim()))) continue;
    const date = m.date != null ? parseDate(r[m.date], m.mdy) : null;
    let val = null;
    if (m.mode === 'split') { const dv = Math.abs(parseAmount(r[m.debit]) || 0), cv = Math.abs(parseAmount(r[m.credit]) || 0); val = cv - dv; }
    else if (m.amount != null) val = parseAmount(r[m.amount]);
    if (!date || !val) continue;
    const type = m.sign === 'allexp' ? 'expense' : m.sign === 'allinc' ? 'income' : val < 0 ? 'expense' : 'income';
    const amount = round2(Math.abs(val));
    const desc = m.desc != null ? String(r[m.desc] ?? '').trim() : '';
    const g = guess(desc, type);
    const importKey = `${date}|${type}|${amount}|${normKey(desc).slice(0, 40)}`;
    // già in Flowa? stesso tipo e importo, al massimo 3 giorni di differenza (la banca registra con un po' di ritardo)
    imp.items.push({ date, type, amount, desc, merchant: g.merchant, category: g.category, method: g.method, importKey, dup: keys.has(importKey) ? true : null, transfer: g.transfer, manual: false });
  }
  // già in Flowa? stesso tipo e importo, al massimo 2 giorni di differenza (la banca registra con un po' di ritardo).
  // Si abbinano prima le coppie più vicine, così ogni movimento di Flowa "copre" una sola riga del file.
  const pairs = [];
  for (const [i, x] of imp.items.entries()) {
    if (x.dup) continue;
    for (const t of live()) {
      if (t.type !== x.type || Math.abs(t.amount - x.amount) >= 0.005) continue;
      const d = Math.abs(daysBetween(t.date, x.date)); if (d > 2) continue;
      const same = t.merchant && normKey(t.merchant) === normKey(x.merchant);
      pairs.push([d - (same ? 0.5 : 0), i, t]);
    }
  }
  const usedT = new Set();
  for (const [, i, t] of pairs.sort((a, b) => a[0] - b[0])) if (!imp.items[i].dup && !usedT.has(t.id)) { imp.items[i].dup = t; usedT.add(t.id); }
  for (const x of imp.items) x.on = !x.dup && !x.transfer;
  imp.items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------- Interfaccia ----------
function openImport() {
  const it = imp.items, m = imp.map;
  const nOn = it.filter((x) => x.on).length, nDup = it.filter((x) => x.dup).length, nTr = it.filter((x) => x.transfer && !x.dup).length;
  const out = it.filter((x) => x.on && x.type === 'expense').reduce((s, x) => s + x.amount, 0);
  const inc = it.filter((x) => x.on && x.type === 'income').reduce((s, x) => s + x.amount, 0);
  const colOpts = (sel, allowNone) => (allowNone ? '<option value="">—</option>' : '') + m.cols.map((c) => `<option value="${c.i}" ${sel === c.i ? 'selected' : ''}>${esc(c.head)}</option>`).join('');
  const sample = (i) => (i == null ? '' : esc(String(m.data[0]?.[i] instanceof Date ? iso(m.data[0][i]) : m.data[0]?.[i] ?? '').slice(0, 24)));
  const catOpts = (type, sel) => cats().filter((c) => c.type === type).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
  const ok = m.date != null && (m.amount != null || m.mode === 'split');
  openSheet(`<div class="sheet__head"><h2>📥 Importa movimenti</h2><button class="x" data-action="close-sheet" aria-label="Chiudi">${ICON.x}</button></div>
    <div class="small muted" style="margin:-4px 0 12px">${esc(imp.file)} · ${m.data.length} righe trovate${imp.kind === 'pdf' ? ' · lettura del PDF sperimentale: controlla bene' : ''}</div>

    <details class="impmap" ${ok && it.length ? '' : 'open'}><summary>Colonne riconosciute ${ok ? '✓' : '⚠️'}</summary>
      <div class="impmap__grid">
        <label><span>📅 Data</span><select class="input" data-imp="date">${colOpts(m.date, true)}</select><i>${sample(m.date)}</i></label>
        <label><span>📝 Descrizione</span><select class="input" data-imp="desc">${colOpts(m.desc, true)}</select><i>${sample(m.desc)}</i></label>
        ${m.mode === 'split' ? `<label><span>➖ Uscite</span><select class="input" data-imp="debit">${colOpts(m.debit, true)}</select><i>${sample(m.debit)}</i></label>
        <label><span>➕ Entrate</span><select class="input" data-imp="credit">${colOpts(m.credit, true)}</select><i>${sample(m.credit)}</i></label>`
        : `<label><span>💶 Importo</span><select class="input" data-imp="amount">${colOpts(m.amount, true)}</select><i>${sample(m.amount)}</i></label>`}
        <label><span>Importi</span><select class="input" data-imp="mode">
          <option value="single" ${m.mode === 'single' ? 'selected' : ''}>In una sola colonna</option><option value="split" ${m.mode === 'split' ? 'selected' : ''}>Uscite ed entrate separate</option></select></label>
        ${m.mode === 'single' ? `<label><span>Segno</span><select class="input" data-imp="sign">
          <option value="neg" ${m.sign === 'neg' ? 'selected' : ''}>Negativi = spese, positivi = entrate</option>
          <option value="allexp" ${m.sign === 'allexp' ? 'selected' : ''}>Sono tutte spese</option>
          <option value="allinc" ${m.sign === 'allinc' ? 'selected' : ''}>Sono tutte entrate</option></select></label>` : ''}
        <label><span>Formato date</span><select class="input" data-imp="mdy"><option value="0" ${!m.mdy ? 'selected' : ''}>Giorno/mese (31/12)</option><option value="1" ${m.mdy ? 'selected' : ''}>Mese/giorno (12/31)</option></select></label>
      </div>
    </details>

    ${it.length ? `<div class="impsum">
      <div><b class="num">${nOn}</b><span>da aggiungere</span></div>
      <div><b class="num">${nDup}</b><span>già in Flowa</span></div>
      ${nTr ? `<div><b class="num">${nTr}</b><span>giroconti?</span></div>` : ''}
    </div>
    <div class="row" style="justify-content:space-between;margin:12px 2px 6px"><span class="small muted">Tocca ☑︎ per includere o escludere. Puoi cambiare la categoria.</span><button class="chip" style="flex:none" data-action="imp-all">${nOn === it.length ? 'Nessuno' : 'Tutti'}</button></div>
    <div class="implist">${it.map((x, i) => `<div class="improw ${x.on ? '' : 'off'}">
      <button class="impchk ${x.on ? 'on' : ''}" data-action="imp-toggle" data-i="${i}" aria-label="Includi">${x.on ? '✓' : ''}</button>
      <div class="improw__main"><div class="improw__top"><span class="improw__name">${esc(x.merchant || x.desc || '—')}</span><span class="num ${x.type === 'income' ? 'in' : ''}">${x.type === 'income' ? '+' : '−'}${fmt(x.amount)}</span></div>
        <div class="improw__sub"><span>${shortDate(x.date)}</span>
          <select class="impcat" data-i="${i}">${catOpts(x.type, x.category)}</select>
          ${x.dup ? `<span class="tag" title="${x.dup === true ? 'Già importato' : esc(txTitle(x.dup) + ' · ' + shortDate(x.dup.date))}">già presente${x.dup !== true ? ': ' + esc(txTitle(x.dup)) : ''}</span>` : x.transfer ? '<span class="tag">giroconto?</span>' : ''}</div>
        ${x.desc && normKey(x.desc) !== normKey(x.merchant) ? `<div class="improw__desc">${esc(x.desc)}</div>` : ''}
      </div></div>`).join('')}</div>`
    : `<div class="card empty" style="box-shadow:none;background:var(--surface-2)"><div class="big">🤔</div><h3>Nessun movimento trovato</h3><p>${ok ? 'Le colonne ci sono ma non ho trovato righe valide.' : 'Scegli qui sopra quale colonna contiene la data e quale l\'importo.'}</p></div>`}

    <div class="sheet__foot"><button class="btn btn--primary btn--block" data-action="imp-go" ${nOn ? '' : 'disabled'}>${nOn ? `Aggiungi ${nOn} moviment${nOn === 1 ? 'o' : 'i'}${out ? ' · −' + fmt0(out) : ''}${inc ? ' · +' + fmt0(inc) : ''}` : 'Niente da aggiungere'}</button></div>`, 'import');
}
function reopenImport() { const p = $('#sheetPanel'); const st = p.scrollTop; openImport(); p.scrollTop = st; }

async function handleFile(file) {
  imp.file = file.name;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  toast('Leggo il file…');
  try {
    let rows;
    if (ext === 'json' || (buf[0] === 0x7b && ext !== 'csv')) {
      const d = JSON.parse(decodeText(buf));
      if (Array.isArray(d.transactions)) { // backup di Flowa
        state.data = merge(state.data, d); persist(); runRecurring(); render(false);
        toast(`Backup importato: ${d.transactions.length} movimenti`); return;
      }
      throw new Error('json');
    }
    if (ext === 'pdf' || (buf[0] === 0x25 && buf[1] === 0x50)) { imp.kind = 'pdf'; rows = await readPdf(buf); }
    else if (['xlsx', 'xls', 'xlsm', 'ods', 'numbers'].includes(ext) || (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf)) { imp.kind = 'sheet'; rows = await readSheet(buf); }
    else { imp.kind = 'csv'; const text = decodeText(buf); rows = /<table/i.test(text) ? await readSheet(buf) : parseCSV(text); }
    if (!rows || rows.length < 2) throw new Error('vuoto');
    imp.rows = rows; imp.map = analyze(rows); buildItems();
    $('#toast').hidden = true;
    openImport();
  } catch (e) {
    console.error(e);
    toast(e.message && e.message.startsWith('Non riesco') ? 'Serve internet per leggere questo tipo di file la prima volta' : 'Non riesco a leggere questo file. Prova con Excel o CSV.');
  }
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'movFile' && e.target.files[0]) { handleFile(e.target.files[0]); e.target.value = ''; }
  const k = e.target.dataset?.imp;
  if (k && imp.map) {
    const v = e.target.value;
    if (k === 'mode') { imp.map.mode = v; if (v === 'split') imp.map.sign = 'split'; else if (imp.map.sign === 'split') imp.map.sign = 'neg'; }
    else if (k === 'sign') imp.map.sign = v;
    else if (k === 'mdy') imp.map.mdy = v === '1';
    else imp.map[k] = v === '' ? null : Number(v);
    buildItems(); reopenImport();
  }
  if (e.target.classList?.contains('impcat')) {
    const it = imp.items[Number(e.target.dataset.i)]; it.category = e.target.value; it.manual = true;
    // stessa scelta per gli altri movimenti dello stesso negozio
    for (const x of imp.items) if (!x.manual && x.type === it.type && normKey(x.merchant) === normKey(it.merchant)) x.category = it.category;
    reopenImport();
  }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action^="imp-"]'); if (!el) return;
  const a = el.dataset.action;
  if (a === 'imp-toggle') { const it = imp.items[Number(el.dataset.i)]; it.on = !it.on; vibrate(5); reopenImport(); }
  if (a === 'imp-all') { const all = imp.items.every((x) => x.on); for (const x of imp.items) x.on = !all; reopenImport(); }
  if (a === 'imp-go') {
    const now = nowIso(); const added = [];
    for (const x of imp.items) if (x.on) {
      const t = { id: uid() + added.length, createdAt: now, updatedAt: now, type: x.type, amount: x.amount, date: x.date, category: x.category, merchant: x.merchant || null, note: null, method: x.method, importKey: x.importKey, imported: true };
      if (x.dup) t.okDup = true; // l'hai incluso tu anche se sembrava già presente
      state.data.transactions.push(t); added.push(t);
    }
    persist(); closeSheet(); render(false); burst();
    toast(`Aggiunti ${added.length} movimenti`, () => { for (const t of added) { t.deleted = true; t.updatedAt = nowIso(); } persist(); render(false); });
  }
});
