import { useEffect, useRef, useState } from 'preact/hooks';
import type { Api } from '../app';
import type { Receipt } from '../lib/model';
import { chargeLabel, missing, MISSING_LABEL, status } from '../lib/model';
import { codingSheet, reportGroups } from '../lib/oracle';
import { download } from '../lib/io';
import { getPreview } from '../lib/store';
import { Chip, fmtDate, fmtMoney } from './bits';

export function Thumb(p: { id: string; kind: string; big?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '';
    getPreview(p.id).then(b => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [p.id]);
  return url ? <img class={p.big ? 'preview' : 'thumb'} src={url} alt="Receipt" />
    : <div class={(p.big ? 'preview' : 'thumb') + ' doc'}>{p.kind === 'docx' ? 'Word' : p.kind === 'pdf' ? 'PDF' : '…'}</div>;
}

type Filter = 'todo' | 'sent' | 'all';

export default function ReceiptsTab({ api }: { api: Api }) {
  const { setup, receipts, busy } = api;
  const [filter, setFilter] = useState<Filter>('todo');
  const cam = useRef<HTMLInputElement>(null), pick = useRef<HTMLInputElement>(null);
  const shown = receipts.filter(r => filter === 'all' || (filter === 'sent' ? r.status === 'sent' : r.status !== 'sent'));
  const ready = receipts.filter(r => status(r, setup) === 'ready');
  const groups = reportGroups(receipts.filter(r => r.status !== 'sent'), setup);

  return (
    <main>
      <header class="top"><h1>Claim Prep</h1><span class="who">{setup.profile.name}</span></header>
      <div class="add">
        <button class="primary big" onClick={() => cam.current?.click()}>Take a photo</button>
        <button class="big" onClick={() => pick.current?.click()}>Add a file</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { const t = e.target as HTMLInputElement; if (t.files) api.addFiles(t.files); t.value = ''; }} />
        <input ref={pick} type="file" multiple accept="image/*,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden
          onChange={e => { const t = e.target as HTMLInputElement; if (t.files) api.addFiles(t.files); t.value = ''; }} />
      </div>
      <p class="tip">Photos, PDFs and Word files. You can pick several at once.</p>

      <div class="filters">
        {(['todo', 'sent', 'all'] as Filter[]).map(f => (
          <button class={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'todo' ? `To do (${receipts.filter(r => r.status !== 'sent').length})` : f === 'sent' ? 'Sent' : 'All'}
          </button>
        ))}
      </div>

      {!shown.length && <p class="empty">{filter === 'todo' ? 'Nothing waiting. Take a photo of a receipt to start.' : 'No receipts here yet.'}</p>}
      <ul class="list">
        {shown.map(r => <Row r={r} api={api} busy={busy[r.id]} />)}
      </ul>

      {filter === 'todo' && ready.length > 0 && <p class="tip">{ready.length} ready to send. Open each one and press <b>Send to Oracle</b>.</p>}

      {groups.length > 0 && filter === 'todo' && (
        <section class="card">
          <h3>Oracle reports these will need</h3>
          <p class="tip">Oracle wants one report per trip or purpose, and never project and non-project items together.</p>
          <ul class="plain">{groups.map(g => <li><b>{g.name}</b> · {g.items.length} item{g.items.length === 1 ? '' : 's'}{g.project ? ' · project' : ''}</li>)}</ul>
        </section>
      )}

      {shown.length > 0 && (
        <div class="row end">
          <button onClick={() => download(`Coding sheet ${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + codingSheet(shown, setup), 'text/csv')}>Download coding sheet</button>
        </div>
      )}
    </main>
  );
}

function Row({ r, api, busy }: { r: Receipt; api: Api; busy?: string }) {
  const st = status(r, api.setup);
  const miss = missing(r, api.setup);
  const cat = api.setup.categories.find(c => c.id === r.categoryId);
  return (
    <li class="item" onClick={() => api.open(r.id)}>
      <Thumb key={r.id + (busy ? ':busy' : '')} id={r.id} kind={r.kind} />
      <div class="body">
        <div class="line1"><b>{r.merchant || (busy ? 'Reading…' : 'Receipt')}</b><span class="amt">{fmtMoney(r.total, r.currency)}</span></div>
        <div class="line2">{fmtDate(r.date)}{cat ? ` · ${cat.name}` : ''}</div>
        <div class="line2">{chargeLabel(api.setup, r.charge) || <i>No account chosen</i>}</div>
        <div class="line3">
          {busy ? <Chip tone="info">{busy}</Chip>
            : st === 'sent' ? <Chip tone="sent">Sent</Chip>
            : st === 'ready' ? <Chip tone="ready">Ready</Chip>
            : <Chip tone="check">Needs {miss.map(m => MISSING_LABEL[m]).slice(0, 2).join(', ')}{miss.length > 2 ? '…' : ''}</Chip>}
          {r.paidBy === 'me' && <Chip tone="info">Pay me back</Chip>}
          {r.flags.length > 0 && st !== 'sent' && <Chip tone="check">{r.flags.length} to check</Chip>}
        </div>
      </div>
    </li>
  );
}
