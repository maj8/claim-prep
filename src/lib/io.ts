// Moving a setup between phones or people: a full backup (JSON) and a codes list (CSV) that an
// administrator can prepare in Excel and send round. Receipts themselves are never in these files.
import type { Account, Project, Setup } from './model';
import { newId } from './model';

export const CODES_CSV_HEADER = ['kind', 'name', 'cost_centre', 'analysis', 'sof', 'project_number', 'task', 'expenditure_org', 'approver'];

export const CODES_CSV_TEMPLATE = [
  CODES_CSV_HEADER.join(','),
  'account,My research account,10019,MJAMESYY,NDRI,,,,',
  'account,Departmental travel,10021,TRASUBYY,FRFG,,,,',
  'project,Everyfish (Innovate UK),10014,A0000000,DOPS,10000423,1,School of Biology (School-wide),approver@st-andrews.ac.uk',
].join('\r\n');

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function codesToCsv(s: Setup): string {
  const rows = [
    ...s.accounts.map(a => ['account', a.label, a.costCentre, a.analysis, a.sof, '', '', '', '']),
    ...s.projects.map(p => ['project', p.label, p.costCentre, p.analysis, p.sof, p.number, p.task, p.expOrg, p.approver]),
  ];
  return [CODES_CSV_HEADER, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

/** Minimal CSV reader: quoted cells, commas or semicolons, Windows or Unix line ends. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/** Add the accounts and projects from a codes CSV. Ones already there (same codes) are updated, not doubled. */
export function importCodesCsv(s: Setup, text: string): { setup: Setup; added: number; updated: number; skipped: string[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { setup: s, added: 0, updated: 0, skipped: ['The file is empty.'] };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (r: string[], ...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return (r[i] || '').trim(); } return ''; };
  const accounts = [...s.accounts], projects = [...s.projects];
  let added = 0, updated = 0; const skipped: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const kind = col(r, 'kind', 'type').toLowerCase();
    const name = col(r, 'name', 'label', 'description');
    const cc = col(r, 'cost_centre', 'cost_center', 'costcentre');
    const analysis = col(r, 'analysis', 'analysis_code');
    const sof = col(r, 'sof', 'source_of_funds');
    const number = col(r, 'project_number', 'project', 'project_id');
    if (kind.startsWith('proj') || (!kind && number)) {
      if (!number) { skipped.push(`Row ${i + 2}: a project needs a project number.`); return; }
      const p: Project = { id: newId(), label: name || `Project ${number}`, number, task: col(r, 'task', 'task_number') || '1', expOrg: col(r, 'expenditure_org', 'expenditure_organisation', 'expenditure_organization'),
        approver: col(r, 'approver', 'project_approver'), costCentre: cc, analysis: analysis || 'A0000000', sof: sof || 'DOPS' };
      const j = projects.findIndex(x => x.number === number);
      if (j >= 0) { projects[j] = { ...p, id: projects[j].id }; updated++; } else { projects.push(p); added++; }
    } else {
      if (!cc || !analysis) { skipped.push(`Row ${i + 2}: an account needs a cost centre and an analysis code.`); return; }
      const a: Account = { id: newId(), label: name || `${cc} ${analysis}`, company: col(r, 'company') || '10', costCentre: cc, analysis, sof };
      const j = accounts.findIndex(x => x.costCentre === cc && x.analysis === analysis);
      if (j >= 0) { accounts[j] = { ...a, id: accounts[j].id }; updated++; } else { accounts.push(a); added++; }
    }
  });
  return { setup: { ...s, accounts, projects }, added, updated, skipped };
}

export function setupToJson(s: Setup, withPersonal: boolean): string {
  const out = withPersonal ? s : { ...s, profile: { ...s.profile, name: '', email: '', cardLast4: '' }, defaultCharge: '' };
  return JSON.stringify({ app: 'claim-prep', exported: new Date().toISOString(), setup: out }, null, 2);
}

export function setupFromJson(current: Setup, text: string): Setup {
  const j = JSON.parse(text);
  const s: Setup | undefined = j?.app === 'claim-prep' ? j.setup : j?.profile ? j : undefined;
  if (!s || !Array.isArray(s.categories)) throw new Error('This is not a Claim Prep setup file.');
  const keep = (a: string, b: string) => a || b;
  return {
    ...current, ...s, done: current.done || s.done,
    profile: { ...current.profile, ...s.profile, name: keep(s.profile.name, current.profile.name), email: keep(s.profile.email, current.profile.email), cardLast4: keep(s.profile.cardLast4, current.profile.cardLast4) },
  };
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
