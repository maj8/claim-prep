// Turns the text recognised on a receipt (ML Kit OCR, a PDF page or a Word file) into expense fields.
// Pure TypeScript with no React Native imports, so it runs in the tests (test/parse.test.ts).
// Handles UK, Spanish, German and US layouts: "31,90", "1.234,56", "1,234.56", "£4.35", "TOTAL EUR 22,00".

export type ExpenseType =
  | 'Travel' | 'Subsistence/Incidentals' | 'Accommodation - General' | 'Training & Conference' | 'IT Equipment'
  | 'Purchase of Goods (Credit Card only)' | 'Purchase of Services (Credit Card only)' | 'Personal Professional Subscriptions'
  | 'Hospitality & Entertainment - Externals' | string;

export interface Parsed {
  merchant: string;
  date: string;            // YYYY-MM-DD or ''
  total: number | null;
  currency: string;        // ISO code or ''
  vat: number | null;
  expenseType: string;     // '' when unsure
  description: string;
  cardLast4: string;       // '' when not printed
  paidCash: boolean;
  nights: number | null;
  flags: string[];
  confidence: 'high' | 'medium' | 'low';
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1, januar: 1, janv: 1,
  feb: 2, february: 2, febrero: 2, februar: 2, fev: 2, 'fév': 2,
  mar: 3, march: 3, marzo: 3, 'märz': 3, mars: 3,
  apr: 4, april: 4, abr: 4, abril: 4, avr: 4,
  may: 5, mayo: 5, mai: 5,
  jun: 6, june: 6, junio: 6, juni: 6, juin: 6,
  jul: 7, july: 7, julio: 7, juli: 7, juil: 7,
  aug: 8, august: 8, ago: 8, agosto: 8, aout: 8, 'août': 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10, okt: 10, oktober: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12, dez: 12, dezember: 12, 'déc': 12,
};

// Suppliers that are hard to spot from layout alone: online services and travel firms.
const KNOWN: { re: RegExp; name: string; type: string; what: string }[] = [
  { re: /netlify/i, name: 'Netlify', type: 'Purchase of Services (Credit Card only)', what: 'Website hosting' },
  { re: /hetzner/i, name: 'Hetzner Online', type: 'Purchase of Services (Credit Card only)', what: 'Cloud server' },
  { re: /hostinger/i, name: 'Hostinger', type: 'Purchase of Services (Credit Card only)', what: 'Web hosting' },
  { re: /hologram/i, name: 'Hologram', type: 'Purchase of Services (Credit Card only)', what: 'SIM data' },
  { re: /openai|chatgpt/i, name: 'OpenAI (ChatGPT)', type: 'Purchase of Services (Credit Card only)', what: 'ChatGPT subscription' },
  { re: /anthropic|claude\.ai/i, name: 'Anthropic (Claude)', type: 'Purchase of Services (Credit Card only)', what: 'Claude subscription' },
  { re: /github/i, name: 'GitHub', type: 'Purchase of Services (Credit Card only)', what: 'GitHub subscription' },
  { re: /trainline/i, name: 'Trainline', type: 'Travel', what: 'Rail' },
  { re: /scotrail/i, name: 'ScotRail', type: 'Travel', what: 'Rail' },
  { re: /\blner\b/i, name: 'LNER', type: 'Travel', what: 'Rail' },
  { re: /avanti west/i, name: 'Avanti West Coast', type: 'Travel', what: 'Rail' },
  { re: /\brenfe\b/i, name: 'Renfe', type: 'Travel', what: 'Rail' },
  { re: /easyjet/i, name: 'easyJet', type: 'Travel', what: 'Flight' },
  { re: /ryanair/i, name: 'Ryanair', type: 'Travel', what: 'Flight' },
  { re: /loganair/i, name: 'Loganair', type: 'Travel', what: 'Flight' },
  { re: /\bklm\b/i, name: 'KLM', type: 'Travel', what: 'Flight' },
  { re: /british airways/i, name: 'British Airways', type: 'Travel', what: 'Flight' },
  { re: /\bvueling\b/i, name: 'Vueling', type: 'Travel', what: 'Flight' },
  { re: /calmac/i, name: 'CalMac', type: 'Travel', what: 'Ferry' },
  { re: /\buber\b/i, name: 'Uber', type: 'Travel', what: 'Taxi' },
  { re: /booking\.com/i, name: 'Booking.com', type: 'Accommodation - General', what: 'Hotel' },
  { re: /airbnb/i, name: 'Airbnb', type: 'Accommodation - General', what: 'Accommodation' },
  { re: /digi-?key/i, name: 'DigiKey', type: 'IT Equipment', what: 'Electronic components' },
  { re: /mouser/i, name: 'Mouser Electronics', type: 'IT Equipment', what: 'Electronic components' },
  { re: /post office/i, name: 'Post Office', type: 'Purchase of Goods (Credit Card only)', what: 'Postage' },
];

// Words that point to an expense type, checked in this order.
const TYPE_WORDS: { type: string; what: string; re: RegExp }[] = [
  { type: 'Accommodation - General', what: 'Hotel', re: /\b(hotel|hostal|hostel|guest ?house|b ?& ?b|inn|lodge|noches?|nights?|habitaci[oó]n|room charge|check[- ]?out|folio)\b/i },
  { type: 'Travel', what: 'Taxi', re: /\b(taxi|cab|bolt|radio ?taxi|licencia)\b/i },
  { type: 'Travel', what: 'Rail', re: /\b(rail|train|railway|tren|bahn|station)\b/i },
  { type: 'Travel', what: 'Flight', re: /\b(flight|airline|airways|boarding|vuelo)\b/i },
  { type: 'Travel', what: 'Bus', re: /\b(bus|coach|autob[uú]s|tram|metro|ferry)\b/i },
  { type: 'Travel', what: 'Parking', re: /\b(parking|car park|aparcamiento)\b/i },
  { type: 'Training & Conference', what: 'Conference registration', re: /\b(registration|conference|symposium|workshop|congress|inscripci[oó]n)\b/i },
  { type: 'Purchase of Services (Credit Card only)', what: 'Online service', re: /\b(subscription|hosting|server|cloud|licen[cs]e|saas|plan renewal)\b/i },
  { type: 'IT Equipment', what: 'IT equipment', re: /\b(laptop|monitor|keyboard|usb|ssd|router|tablet|phone case|charger)\b/i },
  { type: 'Subsistence/Incidentals', what: 'Meal', re: /\b(restaurante?|taberna|bar|pub|bistro|brasserie|caf[eé]|cafeter[ií]a|coffee|latte|americano|flat white|cappuccino|sandwich|bocadillo|menu|men[uú] del d[ií]a|pintxos?|tapas|cerveza|comida|cena|food|kitchen|grill|giraffe|starbucks|costa|pret)\b/i },
];

const TOTAL_WORDS: [RegExp, number][] = [
  [/total\s*(a\s*pagar|to\s*pay|paid|due|charged|eur|gbp|usd|€|£|\$)/i, 10],
  [/importe\s*total|grand\s*total|total\s*amount|amount\s*(due|paid|charged)|balance\s*due|gesamtbetrag|montant\s*total/i, 9],
  [/\b(total|totale|summe|gesamt)\b/i, 7],
  [/\b(importe|a\s*pagar|venta|sale|purchase|amount|charged|paid|pagado|cobrado)\b/i, 4],
];
const NOT_TOTAL = /sub-?total|base\s*imponible|\bvat\b|\biva\b|\btax\b|\bigic\b|\bmwst\b|\btva\b|propina|tip|cambio|change|entregado|tendered|cash\s*given|descuento|discount|points|puntos/i;

/** "31,90" -> 31.9; "1.234,56" -> 1234.56; "1,234.56" -> 1234.56; "1 234,56" -> 1234.56 */
export function toNumber(s: string): number | null {
  let t = s.replace(/[^\d.,]/g, '');
  if (!t) return null;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  const dec = Math.max(lastDot, lastComma);
  if (dec >= 0 && t.length - dec - 1 === 2) {
    t = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1);
  } else {
    t = t.replace(/[.,]/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT_RE = /(?<![\d.,])(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)[.,]\d{2}(?![\d])/g;
export function amountsIn(line: string): number[] {
  const out: number[] = [];
  const clean = line
    .replace(/[·•‧]/g, '.')                              // OCR reads the decimal point as a raised dot
    .replace(/(\d)\s+([.,])\s*(\d{2})(?!\d)/g, '$1$2$3')  // "4 .35" / "4. 35"
    .replace(/(\d)\s(?=\d{3}[.,]\d{2}\b)/g, '$1');     // "1 234,56"
  for (const m of clean.matchAll(AMOUNT_RE)) {
    const n = toNumber(m[0]);
    if (n != null && n > 0 && n < 100000) out.push(n);
  }
  return out;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function validDate(y: number, m: number, d: number, today: Date): string {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2015) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return '';
  if (dt.getTime() > today.getTime() + 2 * 864e5) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** First plausible date on the receipt. Numeric dates are read day-first (UK and Europe) unless that is impossible. */
export function findDate(text: string, today = new Date()): string {
  const lines = text.split('\n');
  const tryLine = (l: string): string => {
    let m = l.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) { const r = validDate(+m[1], +m[2], +m[3], today); if (r) return r; }
    m = l.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/);
    if (m) {
      const r = validDate(+m[3], +m[2], +m[1], today) || validDate(+m[3], +m[1], +m[2], today);
      if (r) return r;
    }
    m = l.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-.]*(?:de\s+)?([A-Za-zÀ-ÿ]{3,10})\.?[\s\-.,]*(?:de\s+)?(\d{2,4})\b/);
    if (m && MONTHS[m[2].toLowerCase()]) { const r = validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1], today); if (r) return r; }
    m = l.match(/\b([A-Za-z]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
    if (m && MONTHS[m[1].toLowerCase()]) { const r = validDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2], today); if (r) return r; }
    return '';
  };
  // Prefer a line that says it is a date ("Fecha", "Date", "Datum").
  for (const l of lines) if (/fecha|date|datum|issued|invoice date/i.test(l)) { const r = tryLine(l); if (r) return r; }
  for (const l of lines) { const r = tryLine(l); if (r) return r; }
  return '';
}

export function findCurrency(text: string, totalLine = ''): string {
  const pick = (s: string): string => {
    if (/€|\bEUR\b|\beuros?\b/i.test(s)) return 'EUR';
    if (/£|\bGBP\b/i.test(s)) return 'GBP';
    if (/\bUSD\b|US\$/i.test(s)) return 'USD';
    if (/\bNOK\b/i.test(s)) return 'NOK';
    if (/\bSEK\b/i.test(s)) return 'SEK';
    if (/\bDKK\b/i.test(s)) return 'DKK';
    if (/\bCHF\b/i.test(s)) return 'CHF';
    if (/\bCAD\b|C\$/i.test(s)) return 'CAD';
    if (/\bAUD\b|A\$/i.test(s)) return 'AUD';
    if (/\$/.test(s)) return 'USD';
    return '';
  };
  const fromTotal = pick(totalLine);
  if (fromTotal) return fromTotal;
  const counts: Record<string, number> = {};
  for (const l of text.split('\n')) { const c = pick(l); if (c) counts[c] = (counts[c] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  // Spanish / EU tax words without a symbol: assume euro.
  if (/\b(iva|cif|nif|importe|factura simplificada|ticket)\b/i.test(text)) return 'EUR';
  return '';
}

export function findTotal(lines: string[]): { total: number | null; line: string; sure: boolean } {
  let best: { score: number; amount: number; line: string } | null = null;
  lines.forEach((l, i) => {
    if (NOT_TOTAL.test(l) && !/total\s*(a\s*pagar|paid|due)/i.test(l)) return;
    for (const [re, score] of TOTAL_WORDS) {
      if (!re.test(l)) continue;
      let a = amountsIn(l);
      let used = l;
      if (!a.length && lines[i + 1] && !NOT_TOTAL.test(lines[i + 1])) { a = amountsIn(lines[i + 1]); used = l + ' ' + lines[i + 1]; }
      if (!a.length) continue;
      const amount = Math.max(...a);
      if (!best || score > best.score || (score === best.score && amount > best.amount)) best = { score, amount, line: used };
      break;
    }
  });
  if (best) {
    const b = best as { score: number; amount: number; line: string };
    return { total: b.amount, line: b.line, sure: b.score >= 7 };
  }
  const all = lines.flatMap(amountsIn);
  return { total: all.length ? Math.max(...all) : null, line: '', sure: false };
}

function findVat(lines: string[], total: number | null): number | null {
  for (const l of lines) {
    if (!/\b(vat|iva|tax|mwst|tva|igic)\b/i.test(l) || /base\s*imponible|excl|sin\s*iva/i.test(l)) continue;
    const a = amountsIn(l.replace(/\d{1,2}([.,]\d{1,2})?\s*%/g, ' ')).filter(n => total == null || n < total);
    if (a.length) return Math.min(...a.filter(n => n > 0));
  }
  return null;
}

const SKIP_MERCHANT = /^(bbva|santander|caixa ?bank|la caixa|sabadell|bankinter|unicaja|kutxabank|ibercaja|redsys|worldpay|sumup|square|barclaycard|global payments|ingenico|verifone|adyen|stripe|elavon|first data|paymentsense|dojo|zettle|visa|mastercard)\b|receipt|recibo|factura|ticket|invoice|\btel[eé]?f?\b|\bphone\b|www\.|https?:|@|\bc\/|calle|avda|avenida|street|road|\bcif\b|\bnif\b|\bvat\b|fecha|date|hora|time|mesa|table|camarero|server|cajero|operator|terminal|comercio|merchant id|n[ºo°]\s*\d|^\s*[\d\s.,:/\-]+\s*$|copia|copy|cliente|customer|welcome|bienvenid|thank|gracias/i;

function title(s: string): string {
  const t = s.trim().replace(/\s{2,}/g, ' ');
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-'(])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(S\.?l\.?|S\.?a\.?|Ltd|Plc|Gmbh)\b/gi, x => x.toUpperCase());
}

export function findMerchant(lines: string[]): string {
  for (const l of lines.slice(0, 8)) {
    const t = l.trim();
    if (t.length < 3 || t.length > 45 || SKIP_MERCHANT.test(t) || amountsIn(t).length) continue;
    const letters = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letters < 3 || letters < t.length * 0.5) continue;
    return title(t);
  }
  return '';
}

function shortPlace(text: string): string {
  const m = text.match(/\b(bilbao|bilbo|barakaldo|loiu|madrid|barcelona|lisbon|lisboa|paris|amsterdam|schiphol|brussels|oslo|bergen|copenhagen|edinburgh|glasgow|oban|aberdeen|dundee|inverness|st andrews|leuchars|london|manchester|cardiff|belfast|dublin)\b/i);
  return m ? title(m[1]) : '';
}

/** Characters text recognition often mixes up with digits (S/5, O/0, B/8, l/1) sitting inside the total. */
function confidenceLowDigits(line: string): boolean {
  return /\d[SOBlI|]\d|[SOBlI|][.,]\d{2}\b|\d[.,][SOBlI|]\d?\b/.test(line);
}

/** Read a receipt's text. `lines` should be in reading order, one printed line each. */
export function parseReceipt(text: string, today = new Date()): Parsed {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flags: string[] = [];
  const known = KNOWN.find(k => k.re.test(text));
  const { total, line: totalLine, sure } = findTotal(lines);
  const currency = findCurrency(text, totalLine);
  const date = findDate(text, today);
  const vat = findVat(lines, total);
  let merchant = known?.name || findMerchant(lines);
  let type = known?.type || '';
  let what = known?.what || '';
  if (!type) { const t = TYPE_WORDS.find(w => w.re.test(text)); if (t) { type = t.type; what = t.what; } }
  const card = text.match(/(?:\*{2,}|x{3,}|•{2,}|\.{3,}|ending(?:\s+in)?|terminada\s+en|tarjeta\s*:?)\s*(\d{4})\b/i);
  const paidCash = /\b(efectivo|cash|contado|metálico)\b/i.test(text) && !/cash\s*back/i.test(text);
  const nightsM = text.match(/(\d{1,2})\s*(?:nights?|noches?|n[aä]chte)/i);
  const nights = nightsM ? +nightsM[1] : null;
  if (/propina|\btip\b|gratuity|service charge/i.test(text)) flags.push('A tip or service charge is shown. Check the amount claimed matches what was paid.');
  if (/minibar|mini-bar|spa\b|pay[- ]?tv|bar charge/i.test(text)) flags.push('Personal extras (minibar, spa, TV) may be listed. These are not claimable.');
  if (/cerveza|beer|wine|vino|gin|whisky|lager|cava|prosecco|copa\b/i.test(text)) flags.push('Alcohol appears on the receipt.');
  if (/sin validez fiscal|no fiscal|not a vat receipt|not a tax invoice/i.test(text)) flags.push('The receipt says it is not a valid tax receipt. Finance may ask for a proper invoice.');
  if (!sure) flags.push('The total was not clearly labelled. Check the amount.');
  // Cross-check the total: subtotal/net + VAT should equal it. A crinkled receipt can turn a 5 into a 9.
  if (total != null) {
    const net = lines.map(l => (/sub-?total|base\s*imponible|\bnet\b|neto|excl/i.test(l) && !/total\s*(a\s*pagar|paid|due)/i.test(l) ? amountsIn(l) : [])).flat()[0];
    const check = net != null && vat != null ? net + vat : null;
    if (check != null && Math.abs(check - total) > 0.011 && Math.abs(check - total) < total * 0.5 && !(net != null && Math.abs(net - total) < 0.011)) {
      flags.unshift(`Check the total: it was read as ${total.toFixed(2)}, but subtotal ${net!.toFixed(2)} + VAT ${vat!.toFixed(2)} = ${check.toFixed(2)}. Compare with the paper receipt.`);
    }
    if (!/[.,]\d{2}/.test(totalLine) || confidenceLowDigits(totalLine)) flags.push('Check the total against the paper receipt.');
  }
  const place = shortPlace(text);
  let description = '';
  if (what) {
    description = what === 'Hotel' && nights ? `Hotel, ${nights} night${nights === 1 ? '' : 's'}` : what;
    const travelling = ['Travel', 'Accommodation - General', 'Subsistence/Incidentals'].includes(type);
    if (travelling && place) description += `, ${place}`;
    else if (travelling && merchant && !known) description += `, ${merchant}`;
  }
  const found = [merchant, date, total != null, currency].filter(Boolean).length;
  return {
    merchant, date, total, currency, vat, expenseType: type, description,
    cardLast4: card ? card[1] : '', paidCash, nights, flags,
    confidence: found === 4 && sure ? 'high' : found >= 3 ? 'medium' : 'low',
  };
}

/** Plain text from a Word .docx document.xml (paragraphs become lines). */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Rebuild printed lines from OCR blocks: words at the same height become one line, left to right. */
export function linesFromBoxes(items: { text: string; top: number; left: number; height: number }[]): string {
  const sorted = [...items].sort((a, b) => a.top - b.top);
  const rows: { y: number; h: number; parts: { x: number; t: string }[] }[] = [];
  for (const it of sorted) {
    const mid = it.top + it.height / 2;
    const row = rows.find(r => Math.abs(r.y - mid) < Math.max(r.h, it.height) * 0.55);
    if (row) row.parts.push({ x: it.left, t: it.text });
    else rows.push({ y: mid, h: it.height, parts: [{ x: it.left, t: it.text }] });
  }
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.t).join('  ')).join('\n');
}
