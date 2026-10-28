import { useState } from 'preact/hooks';
import type { Api } from '../app';
import type { PaidBy, Receipt, Setup } from '../lib/model';
import { MEALS, missing, MISSING_LABEL, newId, status } from '../lib/model';
import { amountsIn } from '../lib/parse';
import { oracleFields } from '../lib/oracle';
import { supplierKey } from '../lib/auto';
import { copyText } from '../lib/send';
import { getFile } from '../lib/store';
import { Chip, Money, Seg, Select, Text, fmtDate, fmtMoney, toast } from './bits';
import type { Opt } from './bits';
import { Thumb } from './ReceiptsTab';

export const CURRENCIES = ['GBP', 'EUR', 'USD', 'NOK', 'SEK', 'DKK', 'CHF', 'CAD', 'AUD', 'NZD', 'JPY', 'PLN', 'CZK', 'ISK', 'UGX'];

export function chargeOptions(s: Setup): Opt[] {
  return [
    ...s.accounts.map(a => ({ value: 'a:' + a.id, label: `${a.label} (${a.costCentre} · ${a.analysis})`, group: 'Accounts' })),
    ...s.projects.map(p => ({ value: 'p:' + p.id, label: `${p.label} (project ${p.number})`, group: 'Projects' })),
  ];
}

export default function ReceiptView({ api, r, onBack }: { api: Api; r: Receipt; onBack: () => void }) {
  const s = api.setup;
  const busy = api.busy[r.id];
  const [showText, setShowText] = useState(false);
  const [zoom, setZoom] = useState(false);
  const set = (patch: Partial<Receipt>) => api.update({ ...r, ...patch });
  const miss = missing(r, s), st = status(r, s);
  const need = (m: string) => r.status !== 'sent' && miss.includes(m as any);
  const cat = s.categories.find(c => c.id === r.categoryId);
  const found = [...new Set(r.text.split('\n').flatMap(amountsIn))].sort((a, b) => b - a).slice(0, 8);
  const foreign = r.currency && r.currency !== s.profile.homeCurrency;

  const rememberSupplier = () => {
    const key = supplierKey(r.merchant);
    if (!key) { toast('Add the supplier’s name first.'); return; }
    const rule = { id: newId(), match: key, categoryId: r.categoryId, charge: r.tripId ? '' : r.charge, description: r.tripId ? '' : r.description.split('. ')[0], learned: false };
    api.saveSetup({ ...s, rules: [...s.rules.filter(x => x.match !== key), rule] });
    toast(`Receipts from “${key}” will be coded like this from now on.`);
  };

  const openFile = async () => {
    const b = await getFile(r.id); if (!b) return;
    const u = URL.createObjectURL(b); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000);
  };

  return (
    <main class="detail">
      <header class="top">
        <button class="quiet" onClick={onBack}>‹ Back</button>
        <h1 class="grow">{r.merchant || 'Receipt'}</h1>
        {st === 'sent' ? <Chip tone="sent">Sent</Chip> : st === 'ready' ? <Chip tone="ready">Ready</Chip> : <Chip tone="check">To check</Chip>}
      </header>

      <div onClick={() => (r.kind === 'image' ? setZoom(true) : openFile())}><Thumb key={r.id + (busy ? ':busy' : '')} id={r.id} kind={r.kind} big /></div>
      <p class="sub">{fmtDate(r.date)} · {fmtMoney(r.total, r.currency)}{foreign && r.home != null ? ` (${r.homeEstimate ? '≈ ' : ''}${fmtMoney(r.home, s.profile.homeCurrency)})` : ''}</p>
      {busy && <p class="busy">{busy}</p>}

      {r.flags.length > 0 && r.status !== 'sent' && (
        <div class="warn"><b>Check before sending</b><ul>{r.flags.map(f => <li>{f}</li>)}</ul></div>
      )}
      {r.auto.length > 0 && r.status !== 'sent' && (
        <div class="note"><b>Filled in for you</b><ul>{r.auto.map(f => <li>{f}</li>)}</ul></div>
      )}

      <section class="form">
        <Select label="What was it for?" value={r.categoryId} need={need('category')} options={s.categories.map(c => ({ value: c.id, label: c.name }))}
          onChange={v => set({ categoryId: v })} hint={cat ? `Oracle: ${cat.expenseType}${cat.itemType ? ' → ' + cat.itemType : ''} · detail code ${cat.detailCode}` : undefined} />
        <Select label="Charge to" value={r.charge} need={need('charge')} options={chargeOptions(s)} placeholder={s.accounts.length + s.projects.length ? 'Choose…' : 'Add accounts in Setup first'}
          onChange={v => set({ charge: v })} />
        {s.trips.length > 0 && (
          <Select label="Trip" value={r.tripId} options={s.trips.map(t => ({ value: t.id, label: t.name }))} placeholder="Not part of a trip"
            onChange={v => { const t = s.trips.find(x => x.id === v); set({ tripId: v, ...(t ? { reason: t.name, ...(t.charge ? { charge: t.charge } : {}) } : {}) }); }} />
        )}
        <Seg label="Paid by" value={r.paidBy} need={need('paidBy')} onChange={v => set({ paidBy: v as PaidBy })}
          options={[{ value: 'card', label: `University card${s.profile.cardLast4 ? ' ·' + s.profile.cardLast4 : ''}` }, { value: 'me', label: 'Me: pay me back' }]} />
        <Text label="Supplier" value={r.merchant} need={need('merchant')} onInput={v => set({ merchant: v })} />
        <div class="two">
          <Text label="Date" type="date" value={r.date} need={need('date')} onInput={v => set({ date: v })} />
          <Money label="Total paid" value={r.total} need={need('total')} onValue={n => set({ total: n, homeEstimate: true })} />
        </div>
        {found.length > 1 && r.status !== 'sent' && (
          <div class="pick"><span>Amounts on the receipt. Tap the one you paid:</span>
            <div>{found.map(a => <button class={a === r.total ? 'on' : ''} onClick={() => set({ total: a, homeEstimate: true })}>{a.toFixed(2)}</button>)}</div>
          </div>
        )}
        <div class="two">
          <Select label="Currency" value={r.currency} need={need('currency')} options={(CURRENCIES.includes(r.currency) || !r.currency ? CURRENCIES : [r.currency, ...CURRENCIES]).map(x => ({ value: x, label: x }))} onChange={v => set({ currency: v })} />
          <Money label="VAT" value={r.vat} onValue={n => set({ vat: n })} />
        </div>
        {foreign && <Money label={`Amount in ${s.profile.homeCurrency}`} value={r.homeEstimate ? null : r.home} placeholder={r.home != null ? `about ${r.home.toFixed(2)}` : ''}
          hint="Optional: what your card statement shows." onValue={n => set({ home: n, homeEstimate: n == null })} />}

        {cat?.needs.includes('meal') && <Seg label="Which meal" value={r.meal} need={need('meal')} options={MEALS.map(m => ({ value: m, label: m }))} onChange={v => set({ meal: v })} />}
        {cat?.needs.includes('route') && <div class="two">
          <Text label="From" value={r.from} onInput={v => set({ from: v })} />
          <Text label="To" value={r.to} onInput={v => set({ to: v })} />
        </div>}
        {cat?.needs.includes('nights') && <Money label="Nights" value={r.nights} onValue={n => set({ nights: n == null ? null : Math.round(n) })} />}
        {cat?.needs.includes('attendees') && <Text label="Guests and their organisations" value={r.attendees} need={need('attendees')} multiline onInput={v => set({ attendees: v })} />}

        <Text label="Description (shown in Oracle)" value={r.description} need={need('description')} multiline onInput={v => set({ description: v })} />
        <Text label="Business reason" value={r.reason} onInput={v => set({ reason: v })} placeholder="e.g. Research, or the meeting" />
        <Text label="Notes for Finance" value={r.notes} multiline onInput={v => set({ notes: v })} />
      </section>

      {miss.length > 0 && r.status !== 'sent' && <p class="needs">Still needed: {miss.map(m => MISSING_LABEL[m]).join(', ')}.</p>}

      <div class="actions">
        {r.status === 'sent'
          ? <button onClick={() => set({ status: 'draft', sentAt: '' })}>Mark as not sent</button>
          : <button class="primary big" disabled={!!miss.length || !!busy} onClick={() => api.send(r)}>Send to Oracle</button>}
        <button onClick={() => api.recode(r)} disabled={!!busy}>Fill in again</button>
        <button onClick={rememberSupplier}>Always code this supplier like this</button>
      </div>

      <section class="card">
        <h3>For Oracle</h3>
        <p class="tip">Tap a value to copy it, in the order Oracle asks for them.</p>
        <dl class="oracle">
          {oracleFields(r, s).map(f => (
            <div onClick={() => f.value && copyText(f.value).then(() => toast(`Copied ${f.label.toLowerCase()}.`))}>
              <dt>{f.label}</dt><dd>{f.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {r.text && <section class="card">
        <button class="quiet" onClick={() => setShowText(!showText)}>{showText ? 'Hide' : 'Show'} the text read from the receipt</button>
        {showText && <pre class="ocr">{r.text}</pre>}
      </section>}

      <div class="actions">
        <button class="danger" onClick={() => { if (confirm('Delete this receipt from this phone?')) api.remove(r.id); }}>Delete receipt</button>
      </div>

      {zoom && <div class="zoom" onClick={() => setZoom(false)}><Thumb key={r.id + (busy ? ':busy' : '')} id={r.id} kind={r.kind} big /></div>}
    </main>
  );
}
