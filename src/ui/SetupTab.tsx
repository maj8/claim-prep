import { useRef, useState } from 'preact/hooks';
import type { Api } from '../app';
import type { Account, Category, Need, Project, Rule, Setup } from '../lib/model';
import { DEFAULT_CATEGORIES, ORACLE_EMAIL, newId } from '../lib/model';
import { CODES_CSV_TEMPLATE, codesToCsv, download, importCodesCsv, setupFromJson, setupToJson } from '../lib/io';
import { Select, Sheet, Text, toast } from './bits';
import { CURRENCIES, chargeOptions } from './ReceiptView';

export function ProfileForm({ s, onChange }: { s: Setup; onChange: (s: Setup) => void }) {
  const p = s.profile;
  const set = (patch: Partial<Setup['profile']>) => onChange({ ...s, profile: { ...p, ...patch } });
  return (
    <>
      <Text label="Your name" value={p.name} onInput={v => set({ name: v })} />
      <Text label="University email" type="email" value={p.email} onInput={v => set({ email: v })} hint="Oracle only accepts receipts sent from this address." />
      <Text label="Last 4 digits of your university card" value={p.cardLast4} inputMode="numeric" maxLength={4}
        onInput={v => set({ cardLast4: v.replace(/\D/g, '').slice(0, 4) })}
        hint="Only the last four digits: enough to tell your university card from your own. The full number is never needed or kept." />
      <Select label="Home currency" value={p.homeCurrency} options={CURRENCIES.map(c => ({ value: c, label: c }))} onChange={v => set({ homeCurrency: v || 'GBP' })} />
    </>
  );
}

export function AccountForm({ a, onChange }: { a: Account; onChange: (a: Account) => void }) {
  const set = (patch: Partial<Account>) => onChange({ ...a, ...patch });
  return (
    <>
      <Text label="Name you'll recognise" value={a.label} placeholder="e.g. My research account" onInput={v => set({ label: v })} />
      <div class="two">
        <Text label="Cost centre" value={a.costCentre} inputMode="numeric" placeholder="10019" onInput={v => set({ costCentre: v.trim() })} />
        <Text label="Analysis code" value={a.analysis} placeholder="MJAMESYY" onInput={v => set({ analysis: v.trim().toUpperCase() })} />
      </div>
      <div class="two">
        <Text label="Source of funds (SOF)" value={a.sof} placeholder="NDRI" onInput={v => set({ sof: v.trim().toUpperCase() })} />
        <Text label="Company" value={a.company} placeholder="10" onInput={v => set({ company: v.trim() })} />
      </div>
      <p class="tip">Oracle account: {a.company || '10'}-{a.costCentre || 'CC'}-<i>detail</i>-{a.analysis || 'ANALYSIS'}-{a.sof || 'SOF'}-9999999. The detail code comes from what was bought.</p>
    </>
  );
}

export function ProjectForm({ p, onChange }: { p: Project; onChange: (p: Project) => void }) {
  const set = (patch: Partial<Project>) => onChange({ ...p, ...patch });
  return (
    <>
      <Text label="Name you'll recognise" value={p.label} placeholder="e.g. Everyfish (Innovate UK)" onInput={v => set({ label: v })} />
      <div class="two">
        <Text label="Project number" value={p.number} inputMode="numeric" placeholder="10000423" onInput={v => set({ number: v.trim() })} />
        <Text label="Task number" value={p.task} placeholder="1" onInput={v => set({ task: v.trim() })} />
      </div>
      <Text label="Expenditure organisation" value={p.expOrg} placeholder="e.g. School of Biology (School-wide)" onInput={v => set({ expOrg: v })} />
      <Text label="Project approver (email)" type="email" value={p.approver} onInput={v => set({ approver: v.trim() })} />
      <div class="two">
        <Text label="Project's cost centre" value={p.costCentre} inputMode="numeric" placeholder="10014" onInput={v => set({ costCentre: v.trim() })} />
        <Text label="Analysis / SOF" value={`${p.analysis}/${p.sof}`} placeholder="A0000000/DOPS" onInput={v => { const [an, sf] = v.toUpperCase().split('/'); set({ analysis: (an || '').trim(), sof: (sf || '').trim() }); }} />
      </div>
      <p class="tip">These are on any earlier Oracle claim for the project, or ask your finance contact.</p>
    </>
  );
}

const blankAccount = (): Account => ({ id: newId(), label: '', company: '10', costCentre: '', analysis: '', sof: '' });
const blankProject = (): Project => ({ id: newId(), label: '', number: '', task: '1', expOrg: '', approver: '', costCentre: '', analysis: 'A0000000', sof: 'DOPS' });

export function useImport(api: Api, current: () => Setup, onDone?: (s: Setup) => void) {
  const input = useRef<HTMLInputElement>(null);
  const el = <input ref={input} type="file" accept=".csv,.json,text/csv,application/json,text/plain" hidden onChange={async e => {
    const t = e.target as HTMLInputElement; const f = t.files?.[0]; t.value = '';
    if (!f) return;
    const text = await f.text();
    try {
      if (/^\s*\{/.test(text)) {
        const s = setupFromJson(current(), text); api.saveSetup(s); onDone?.(s);
        toast(`Loaded ${s.accounts.length} accounts, ${s.projects.length} projects and ${s.rules.length} supplier rules.`);
      } else {
        const res = importCodesCsv(current(), text);
        api.saveSetup(res.setup); onDone?.(res.setup);
        toast(`${res.added} added, ${res.updated} updated${res.skipped.length ? `, ${res.skipped.length} rows skipped` : ''}.`);
        if (res.skipped.length) setTimeout(() => alert(res.skipped.join('\n')), 300);
      }
    } catch (err: any) { toast(String(err?.message || err)); }
  }} />;
  return { el, open: () => input.current?.click() };
}

export default function SetupTab({ api }: { api: Api }) {
  const s = api.setup;
  const save = (n: Setup) => api.saveSetup(n);
  const [acc, setAcc] = useState<Account | null>(null);
  const [prj, setPrj] = useState<Project | null>(null);
  const [cat, setCat] = useState<Category | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [open, setOpen] = useState<string>('codes');
  const imp = useImport(api, () => api.setup);
  const backup = useImport(api, () => api.setup);
  const sec = (id: string, title: string, sub: string) => (
    <button class={'sec' + (open === id ? ' on' : '')} onClick={() => setOpen(open === id ? '' : id)}><b>{title}</b><span>{sub}</span></button>
  );

  return (
    <main>
      <header class="top"><h1>Setup</h1></header>

      {sec('me', 'Your details', s.profile.name || 'Name, email, card')}
      {open === 'me' && <div class="card"><ProfileForm s={s} onChange={save} />
        <Text label="Oracle's receipt email address" value={s.profile.oracleEmail} onInput={v => save({ ...s, profile: { ...s.profile, oracleEmail: v.trim() } })}
          hint="St Andrews address filled in. Change it only if Finance gives you a different one." />
        {s.profile.oracleEmail !== ORACLE_EMAIL && <button class="quiet" onClick={() => save({ ...s, profile: { ...s.profile, oracleEmail: ORACLE_EMAIL } })}>Use the St Andrews address</button>}
      </div>}

      {sec('codes', 'Accounts and projects', `${s.accounts.length} account${s.accounts.length === 1 ? '' : 's'}, ${s.projects.length} project${s.projects.length === 1 ? '' : 's'}`)}
      {open === 'codes' && <div class="card">
        <h3>Accounts (non-project)</h3>
        <ul class="plain rows">{s.accounts.map(a => <li onClick={() => setAcc(a)}><b>{a.label}</b><span>{a.costCentre} · {a.analysis} · {a.sof}</span></li>)}</ul>
        <button onClick={() => setAcc(blankAccount())}>Add an account</button>
        <h3>Projects</h3>
        <ul class="plain rows">{s.projects.map(p => <li onClick={() => setPrj(p)}><b>{p.label}</b><span>Project {p.number} · task {p.task}</span></li>)}</ul>
        <button onClick={() => setPrj(blankProject())}>Add a project</button>
        <Select label="Usual account (used when nothing else decides)" value={s.defaultCharge} options={chargeOptions(s)} onChange={v => save({ ...s, defaultCharge: v })} />
        <h3>Share or load a list</h3>
        <p class="tip">Your administrator can fill in a spreadsheet of accounts and projects, save it as CSV and send it round. Load it here.</p>
        <div class="row wrap">
          <button onClick={imp.open}>Load a list (CSV or setup file)</button>
          <button onClick={() => download('Claim Prep codes.csv', '﻿' + codesToCsv(s), 'text/csv')}>Download my list</button>
          <button class="quiet" onClick={() => download('Claim Prep codes template.csv', '﻿' + CODES_CSV_TEMPLATE, 'text/csv')}>Blank template</button>
        </div>
        {imp.el}
      </div>}

      {sec('cats', 'What things are for', `${s.categories.length} types, with Oracle detail codes`)}
      {open === 'cats' && <div class="card">
        <p class="tip">Each type sets Oracle's expense type, itemisation and detail code, and the words that recognise it on a receipt. St Andrews codes are filled in. Check them with your finance contact.</p>
        <ul class="plain rows">{s.categories.map(c => <li onClick={() => setCat(c)}><b>{c.name}</b><span>{c.detailCode} · {c.expenseType}</span></li>)}</ul>
        <div class="row wrap">
          <button onClick={() => setCat({ id: newId(), name: '', expenseType: '', itemType: '', detailCode: '', procurement: '', keywords: '', needs: [], travel: false })}>Add a type</button>
          <button class="quiet" onClick={() => { if (confirm('Put back the St Andrews list? Your changes to types will be lost.')) save({ ...s, categories: DEFAULT_CATEGORIES.map(x => ({ ...x, needs: [...x.needs] })) }); }}>Reset to St Andrews list</button>
        </div>
      </div>}

      {sec('rules', 'Supplier rules', `${s.rules.length} remembered`)}
      {open === 'rules' && <div class="card">
        <p class="tip">When a receipt is sent, the app remembers how that supplier was coded. Add your own for regular suppliers. Your own rules win over learnt ones.</p>
        <ul class="plain rows">{[...s.rules].sort((a, b) => a.match.localeCompare(b.match)).map(r => (
          <li onClick={() => setRule(r)}><b>{r.match}</b><span>{s.categories.find(c => c.id === r.categoryId)?.name || '—'}{r.learned ? ' · learnt' : ''}</span></li>
        ))}</ul>
        <button onClick={() => setRule({ id: newId(), match: '', categoryId: '', charge: '', description: '', learned: false })}>Add a rule</button>
      </div>}

      {sec('backup', 'Backup and new phone', 'Move your setup')}
      {open === 'backup' && <div class="card">
        <p class="tip">Your setup lives only on this phone. Save a backup to move it to a new phone, or share your codes and rules with a colleague (without your name or card).</p>
        <div class="row wrap">
          <button onClick={() => download('Claim Prep backup.json', setupToJson(s, true), 'application/json')}>Save my backup</button>
          <button onClick={() => download('Claim Prep setup to share.json', setupToJson(s, false), 'application/json')}>Save a copy to share</button>
          <button onClick={backup.open}>Load a backup</button>
        </div>
        {backup.el}
        <p class="tip">Receipts are not in the backup. Send them to Oracle before changing phone.</p>
      </div>}

      {sec('about', 'About and privacy', 'Where your data goes')}
      {open === 'about' && <div class="card">
        <p>Claim Prep reads receipts on this phone. Photos, text and your codes are stored only in this browser on this phone. They go nowhere except the email you choose to send. The only outside request is an exchange-rate lookup (currency and date) for foreign receipts.</p>
        <p class="tip">To install: in Chrome on Android tap ⋮ then <b>Add to Home screen</b> (or <b>Install app</b>). On iPhone, in Safari tap Share then <b>Add to Home Screen</b>.</p>
        <p class="tip">Version {__APP_VERSION__}</p>
        <button class="danger" onClick={() => { if (confirm('Erase all receipts and your setup from this phone?')) { indexedDB.databases?.().then(ds => ds.forEach(d => d.name && indexedDB.deleteDatabase(d.name))).finally(() => setTimeout(() => location.reload(), 500)); } }}>Erase everything on this phone</button>
      </div>}

      {acc && <Sheet title="Account" onClose={() => setAcc(null)}>
        <AccountForm a={acc} onChange={setAcc} />
        <div class="row">
          {s.accounts.some(x => x.id === acc.id) && <button class="danger" onClick={() => { save({ ...s, accounts: s.accounts.filter(x => x.id !== acc.id) }); setAcc(null); }}>Delete</button>}
          <button class="primary" onClick={() => {
            if (!acc.costCentre || !acc.analysis) { toast('An account needs a cost centre and an analysis code.'); return; }
            const accounts = s.accounts.some(x => x.id === acc.id) ? s.accounts.map(x => (x.id === acc.id ? acc : x)) : [...s.accounts, { ...acc, label: acc.label || `${acc.costCentre} ${acc.analysis}` }];
            save({ ...s, accounts, defaultCharge: s.defaultCharge || 'a:' + acc.id }); setAcc(null);
          }}>Save</button>
        </div>
      </Sheet>}

      {prj && <Sheet title="Project" onClose={() => setPrj(null)}>
        <ProjectForm p={prj} onChange={setPrj} />
        <div class="row">
          {s.projects.some(x => x.id === prj.id) && <button class="danger" onClick={() => { save({ ...s, projects: s.projects.filter(x => x.id !== prj.id) }); setPrj(null); }}>Delete</button>}
          <button class="primary" onClick={() => {
            if (!prj.number) { toast('A project needs its project number.'); return; }
            const projects = s.projects.some(x => x.id === prj.id) ? s.projects.map(x => (x.id === prj.id ? prj : x)) : [...s.projects, { ...prj, label: prj.label || `Project ${prj.number}` }];
            save({ ...s, projects, defaultCharge: s.defaultCharge || 'p:' + prj.id }); setPrj(null);
          }}>Save</button>
        </div>
      </Sheet>}

      {cat && <Sheet title="Type of expense" onClose={() => setCat(null)}>
        <Text label="Name" value={cat.name} onInput={v => setCat({ ...cat, name: v })} />
        <Text label="Oracle expense type" value={cat.expenseType} placeholder="e.g. Travel" onInput={v => setCat({ ...cat, expenseType: v })} />
        <Text label="Oracle itemisation type" value={cat.itemType} placeholder="e.g. Taxi Fares (blank if none)" onInput={v => setCat({ ...cat, itemType: v })} />
        <div class="two">
          <Text label="Detail code" value={cat.detailCode} inputMode="numeric" onInput={v => setCat({ ...cat, detailCode: v.trim() })} />
          <Text label="Procurement category" value={cat.procurement} onInput={v => setCat({ ...cat, procurement: v })} />
        </div>
        <Text label="Words that recognise it (comma separated)" value={cat.keywords} multiline onInput={v => setCat({ ...cat, keywords: v })} />
        <div class="field"><span class="lbl">Also ask for</span><div class="seg">
          {(['meal', 'route', 'nights', 'attendees'] as Need[]).map(n => <button class={cat.needs.includes(n) ? 'on' : ''} onClick={() => setCat({ ...cat, needs: cat.needs.includes(n) ? cat.needs.filter(x => x !== n) : [...cat.needs, n] })}>{n === 'route' ? 'from/to' : n}</button>)}
          <button class={cat.travel ? 'on' : ''} onClick={() => setCat({ ...cat, travel: !cat.travel })}>part of trips</button>
        </div></div>
        <div class="row">
          {s.categories.some(x => x.id === cat.id) && <button class="danger" onClick={() => { save({ ...s, categories: s.categories.filter(x => x.id !== cat.id) }); setCat(null); }}>Delete</button>}
          <button class="primary" onClick={() => {
            if (!cat.name || !cat.expenseType) { toast('A type needs a name and an Oracle expense type.'); return; }
            save({ ...s, categories: s.categories.some(x => x.id === cat.id) ? s.categories.map(x => (x.id === cat.id ? cat : x)) : [...s.categories, cat] }); setCat(null);
          }}>Save</button>
        </div>
      </Sheet>}

      {rule && <Sheet title="Supplier rule" onClose={() => setRule(null)}>
        <Text label="Supplier name contains" value={rule.match} placeholder="e.g. hetzner" onInput={v => setRule({ ...rule, match: v, learned: false })} />
        <Select label="What it is for" value={rule.categoryId} options={s.categories.map(c => ({ value: c.id, label: c.name }))} onChange={v => setRule({ ...rule, categoryId: v, learned: false })} />
        <Select label="Charge to" value={rule.charge} options={chargeOptions(s)} placeholder="Decide each time (trips, usual account)" onChange={v => setRule({ ...rule, charge: v, learned: false })} />
        <Text label="Description" value={rule.description} placeholder="e.g. Cloud server for the Merra-drift model" onInput={v => setRule({ ...rule, description: v, learned: false })} />
        <div class="row">
          {s.rules.some(x => x.id === rule.id) && <button class="danger" onClick={() => { save({ ...s, rules: s.rules.filter(x => x.id !== rule.id) }); setRule(null); }}>Delete</button>}
          <button class="primary" onClick={() => {
            if (!rule.match.trim() || !rule.categoryId) { toast('A rule needs the supplier and what it is for.'); return; }
            save({ ...s, rules: [...s.rules.filter(x => x.id !== rule.id), rule] }); setRule(null);
          }}>Save</button>
        </div>
      </Sheet>}
    </main>
  );
}
