// An estimate in your home currency for foreign receipts, from the European Central Bank's rate for the
// receipt's date (frankfurter.dev). Oracle applies its own card rate; this is only to help you check.
import { fxGet, fxSet } from './store';

const FALLBACK_PER_GBP: Record<string, number> = {
  EUR: 1.185, USD: 1.327, NOK: 13.4, SEK: 12.6, DKK: 8.84, CHF: 1.106, CAD: 1.886, AUD: 1.893, NZD: 2.3, JPY: 210.2, PLN: 4.98, CZK: 28.7, ISK: 162,
};

export async function toHome(amount: number, currency: string, date: string, home: string): Promise<{ value: number; estimate: boolean } | null> {
  if (!currency || currency === home) return { value: amount, estimate: false };
  const day = date || new Date().toISOString().slice(0, 10);
  const key = `${day}:${currency}:${home}`;
  let rate = await fxGet(key);
  if (rate == null) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(`https://api.frankfurter.dev/v1/${day}?from=${currency}&to=${home}`, { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) { const j = await res.json(); rate = j?.rates?.[home] ?? undefined; if (rate) await fxSet(key, rate); }
    } catch { /* offline */ }
  }
  if (rate == null && home === 'GBP' && FALLBACK_PER_GBP[currency]) rate = 1 / FALLBACK_PER_GBP[currency];
  if (rate == null) return null;
  return { value: Math.round(amount * rate * 100) / 100, estimate: true };
}
