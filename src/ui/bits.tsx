// Small shared pieces of the interface.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export function Field(p: { label: string; hint?: string; need?: boolean; children: ComponentChildren }) {
  return (
    <label class={'field' + (p.need ? ' need' : '')}>
      <span class="lbl">{p.label}{p.need ? <em> · needed</em> : null}</span>
      {p.children}
      {p.hint ? <span class="hint">{p.hint}</span> : null}
    </label>
  );
}

export function Text(p: { label: string; value: string; onInput: (v: string) => void; need?: boolean; hint?: string; placeholder?: string; type?: string; multiline?: boolean; inputMode?: 'text' | 'numeric' | 'decimal' | 'email'; maxLength?: number }) {
  return (
    <Field label={p.label} need={p.need} hint={p.hint}>
      {p.multiline
        ? <textarea value={p.value} placeholder={p.placeholder} rows={2} onInput={e => p.onInput((e.target as HTMLTextAreaElement).value)} />
        : <input type={(p.type || 'text') as any} value={p.value} placeholder={p.placeholder} inputMode={p.inputMode} maxLength={p.maxLength}
            onInput={e => p.onInput((e.target as HTMLInputElement).value)} />}
    </Field>
  );
}

/** A money box that keeps exactly what you type ("9.", "12,5") while you type. */
export function Money(p: { label: string; value: number | null; onValue: (n: number | null) => void; need?: boolean; hint?: string; placeholder?: string }) {
  const show = (n: number | null) => (n == null ? '' : String(n));
  const parse = (s: string) => { const t = s.replace(',', '.').replace(/[^\d.]/g, ''); if (!t || t === '.') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
  const [text, setText] = useState(show(p.value));
  useEffect(() => { if (parse(text) !== p.value) setText(show(p.value)); }, [p.value]);
  return (
    <Field label={p.label} need={p.need} hint={p.hint}>
      <input type="text" inputMode="decimal" value={text} placeholder={p.placeholder}
        onInput={e => { const t = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, ''); setText(t); p.onValue(parse(t)); }} />
    </Field>
  );
}

export interface Opt { value: string; label: string; group?: string }
export function Select(p: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; need?: boolean; hint?: string; placeholder?: string }) {
  const groups = [...new Set(p.options.map(o => o.group || ''))];
  const opt = (o: Opt) => <option value={o.value} selected={o.value === p.value}>{o.label}</option>;
  return (
    <Field label={p.label} need={p.need} hint={p.hint}>
      <select onChange={e => p.onChange((e.target as HTMLSelectElement).value)}>
        <option value="" selected={!p.value}>{p.placeholder || 'Choose…'}</option>
        {groups.map(g => (g ? <optgroup label={g}>{p.options.filter(o => o.group === g).map(opt)}</optgroup> : p.options.filter(o => !o.group).map(opt)))}
      </select>
    </Field>
  );
}

export function Seg(p: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; need?: boolean }) {
  return (
    <div class={'field' + (p.need ? ' need' : '')}>
      <span class="lbl">{p.label}{p.need ? <em> · needed</em> : null}</span>
      <div class="seg">
        {p.options.map(o => <button type="button" class={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function Chip(p: { tone: 'check' | 'ready' | 'sent' | 'info'; children: ComponentChildren }) {
  return <span class={'chip ' + p.tone}>{p.children}</span>;
}

export function Sheet(p: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-bg" onClick={e => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div class="sheet" role="dialog" aria-label={p.title}>
        <div class="sheet-head"><h2>{p.title}</h2><button class="quiet" onClick={p.onClose}>Close</button></div>
        <div class="sheet-body">{p.children}</div>
      </div>
    </div>
  );
}

let toastSet: ((t: string) => void) | null = null;
export function toast(t: string) { toastSet?.(t); }
export function Toaster() {
  const [t, setT] = useState('');
  useEffect(() => { toastSet = (x) => { setT(x); setTimeout(() => setT(cur => (cur === x ? '' : cur)), 3500); }; return () => { toastSet = null; }; }, []);
  return t ? <div class="toast" role="status">{t}</div> : null;
}

export const fmtMoney = (n: number | null, cur: string) => {
  if (n == null) return '—';
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur || 'GBP' }).format(n); } catch { return `${cur} ${n.toFixed(2)}`; }
};
export const fmtDate = (d: string) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'No date');
