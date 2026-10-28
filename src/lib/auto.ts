// Fills in a receipt as far as possible from the text read off it and the person's own setup,
// and remembers how each supplier was coded so the next receipt from them needs nothing.
import { parseReceipt } from './parse';
import type { Category, Receipt, Rule, Setup, Trip } from './model';
import { newId } from './model';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** The word or phrase that identifies a supplier: its first distinctive word(s). */
export function supplierKey(merchant: string): string {
  const words = norm(merchant).split(' ').filter(w => w.length > 2 && !['the', 'ltd', 'limited', 'inc', 'gmbh', 'plc', 'sl', 'sa', 'and', 'restaurante', 'hotel', 'cafe', 'bar'].includes(w));
  return words.slice(0, 2).join(' ');
}

export function findRule(rules: Rule[], merchant: string, text: string): Rule | undefined {
  const hay = ' ' + norm(merchant + ' ' + text.slice(0, 600)) + ' ';
  return rules
    .filter(r => r.match.trim() && hay.includes(' ' + norm(r.match) + ' '))
    .sort((a, b) => Number(a.learned) - Number(b.learned) || b.match.length - a.match.length)[0];
}

/** Score each category by its keywords appearing on the receipt; the supplier's name counts double. */
export function guessCategory(categories: Category[], merchant: string, text: string): Category | undefined {
  const body = ' ' + norm(text) + ' ', name = ' ' + norm(merchant) + ' ';
  let best: { c: Category; s: number } | undefined;
  for (const c of categories) {
    let s = 0;
    for (const k of c.keywords.split(',').map(norm).filter(Boolean)) {
      if (name.includes(' ' + k + ' ')) s += 3;
      else if (body.includes(' ' + k + ' ')) s += 1;
    }
    if (s && (!best || s > best.s)) best = { c, s };
  }
  return best?.c;
}

export function tripFor(trips: Trip[], date: string): Trip | undefined {
  if (!date) return undefined;
  return trips.find(t => t.start && t.end && date >= addDays(t.start, -2) && date <= addDays(t.end, 1));
}
function addDays(d: string, n: number): string {
  const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

export function mealFromTime(time: string): string {
  if (!time) return '';
  const h = +time.slice(0, 2);
  return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : 'Dinner';
}

function findTime(text: string): string {
  const m = text.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)(?::[0-5]\d)?\b(?!\s*(?:€|eur|gbp|£|%))/i);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function place(text: string): string {
  const m = text.match(/\b(bilbao|barakaldo|loiu|madrid|barcelona|lisbon|lisboa|paris|amsterdam|schiphol|brussels|oslo|bergen|copenhagen|hirtshals|aalborg|edinburgh|glasgow|oban|aberdeen|dundee|inverness|st andrews|leuchars|london|heathrow|manchester|cardiff|belfast|dublin)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
}

/** Read the text and fill in everything the app can. Fields the person already set are left alone. */
export function autofill(r: Receipt, text: string, setup: Setup, today = new Date()): Receipt {
  const p = parseReceipt(text, today);
  const out: Receipt = { ...r, text, flags: p.flags, auto: [] };
  const say = (s: string) => out.auto.push(s);
  if (!out.merchant) out.merchant = p.merchant;
  if (!out.date) out.date = p.date;
  if (out.total == null) out.total = p.total;
  if (!out.currency) out.currency = p.currency;
  if (out.vat == null) out.vat = p.vat;
  if (!out.time) out.time = findTime(text);
  if (out.nights == null) out.nights = p.nights;

  // Who paid: the card's last four digits, or cash.
  if (!out.paidBy) {
    const last4 = setup.profile.cardLast4;
    if (!last4) out.paidBy = 'me';   // no university card: everything is paid back to you
    else if (p.paidCash) { out.paidBy = 'me'; say('Paid in cash, so marked to be paid back to you.'); }
    else if (p.cardLast4 && last4 && p.cardLast4 !== last4) { out.paidBy = 'me'; say(`Paid with a card ending ${p.cardLast4}, not your university card, so marked to be paid back to you.`); }
    else { out.paidBy = 'card'; if (p.cardLast4 && p.cardLast4 === last4) say(`Your university card ending ${last4} is on the receipt.`); }
  }
  return applyCoding(out, setup);
}

/** Choose what it was for, what to charge and the description, from rules, trips and keywords. */
export function applyCoding(r: Receipt, setup: Setup): Receipt {
  const out: Receipt = { ...r, auto: [...r.auto] };
  const say = (s: string) => { if (!out.auto.includes(s)) out.auto.push(s); };
  const rule = findRule(setup.rules, out.merchant, out.text);
  if (rule) say(`Coded like your earlier receipts from “${rule.match}”.`);

  if (!out.categoryId) {
    const cat = (rule && setup.categories.find(c => c.id === rule.categoryId)) || guessCategory(setup.categories, out.merchant, out.text);
    if (cat) { out.categoryId = cat.id; if (!rule) say(`Looks like “${cat.name}” from the words on the receipt.`); }
  }
  const cat = setup.categories.find(c => c.id === out.categoryId);

  const trip = setup.trips.find(t => t.id === out.tripId) || (cat?.travel || !cat ? tripFor(setup.trips, out.date) : undefined);
  if (trip && !out.tripId && (cat?.travel ?? true)) { out.tripId = trip.id; say(`Dated during your trip “${trip.name}”.`); }

  if (!out.charge) {
    if (trip && (cat?.travel ?? true) && trip.charge) { out.charge = trip.charge; say('Charged to the trip’s account.'); }
    else if (rule?.charge) out.charge = rule.charge;
    else if (setup.defaultCharge) { out.charge = setup.defaultCharge; say('Charged to your usual account. Change it if this one belongs elsewhere.'); }
  }
  if (!out.reason) out.reason = trip ? trip.name : '';
  if (cat?.needs.includes('meal') && !out.meal) { out.meal = mealFromTime(out.time); if (out.meal) say(`${out.meal}, from the time printed (${out.time}).`); }
  if (!out.description) {
    const where = place(out.text) || (cat?.travel ? '' : '');
    const base = rule?.description || (cat ? describe(cat, out, where) : '');
    out.description = [base, trip ? trip.name : '', trip?.note ? `(${trip.note})` : ''].filter(Boolean).join('. ').replace(/\.\s*\(/, ' (');
  }
  return out;
}

function describe(cat: Category, r: Receipt, where: string): string {
  switch (cat.id) {
    case 'meal': return [r.meal || 'Meal', where].filter(Boolean).join(', ');
    case 'hotel': return ['Hotel' + (r.nights ? `, ${r.nights} night${r.nights === 1 ? '' : 's'}` : ''), where].filter(Boolean).join(', ');
    case 'taxi': case 'train': case 'flight': case 'bus':
      return [cat.name, r.from && r.to ? `${r.from} to ${r.to}` : where].filter(Boolean).join(', ');
    default: return r.merchant ? `${cat.name}, ${r.merchant}` : cat.name;
  }
}

/** After a receipt is sent, remember its supplier's coding (not for trip items, which change trip to trip). */
export function learn(setup: Setup, r: Receipt): Setup {
  const key = supplierKey(r.merchant);
  if (!key || !r.categoryId) return setup;
  const cat = setup.categories.find(c => c.id === r.categoryId);
  const isTrip = !!r.tripId && cat?.travel;
  const existing = setup.rules.find(x => norm(x.match) === key);
  if (existing && !existing.learned) return setup;   // the person's own rule wins
  const rule: Rule = {
    id: existing?.id || newId(), match: key, categoryId: r.categoryId,
    charge: isTrip ? '' : r.charge, description: isTrip ? '' : r.description.split('. ')[0], learned: true,
  };
  return { ...setup, rules: [...setup.rules.filter(x => x.id !== rule.id), rule] };
}
