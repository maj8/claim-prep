// What goes to Oracle: the email with the receipt, the fields in the order Oracle asks for them,
// and a coding sheet (CSV) like the tables administrators keep.
import type { Receipt, Setup } from './model';
import { accountString, chargeLabel, findCharge } from './model';

export const dmy = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const money = (n: number | null) => (n == null ? '' : n.toFixed(2));

export interface Field { label: string; value: string }

/** Oracle's fields for this expense, in the order they appear on the Oracle screen. */
export function oracleFields(r: Receipt, s: Setup): Field[] {
  const cat = s.categories.find(c => c.id === r.categoryId);
  const { project } = findCharge(s, r.charge);
  const trip = s.trips.find(t => t.id === r.tripId);
  const f: Field[] = [
    { label: 'Date', value: dmy(r.date) },
    { label: 'Type', value: cat?.expenseType || '' },
    { label: 'Expense Location', value: '' },
    { label: 'Amount', value: `${money(r.total)} ${r.currency}` },
    { label: 'Description', value: r.description },
    { label: 'Merchant Name', value: r.merchant },
  ];
  if (cat?.itemType) f.push({ label: 'Itemization type', value: cat.itemType });
  f.push({ label: 'Account', value: accountString(s, r.charge, cat?.detailCode || '') });
  if (project) {
    f.push({ label: 'Project Number', value: project.number }, { label: 'Task Number', value: project.task },
      { label: 'Expenditure Organization', value: project.expOrg }, { label: 'Approver', value: project.approver });
  }
  f.push({ label: cat?.expenseType === 'Travel' ? 'Business reason for travel' : 'Business reason', value: r.reason || (cat?.procurement ? 'Research' : '') });
  if (cat?.procurement) f.push({ label: 'Procurement Category', value: cat.procurement }, { label: 'Why use credit card?', value: 'Online purchase' });
  if (cat?.needs.includes('meal')) f.push({ label: 'Meal claimed', value: r.meal });
  if (cat?.needs.includes('route')) f.push({ label: 'Departure location', value: r.from }, { label: 'Arrival location', value: r.to });
  if (cat?.needs.includes('nights') && r.nights) f.push({ label: 'Nights', value: String(r.nights) });
  if (cat?.needs.includes('attendees')) f.push({ label: 'Attendees', value: r.attendees });
  if (trip) f.push({ label: 'Start / end date', value: `${dmy(trip.start)} – ${dmy(trip.end)}` }, { label: 'Town and City', value: '' });
  f.push({ label: 'Paid by', value: r.paidBy === 'me' ? 'Me: to be reimbursed' : `University card${s.profile.cardLast4 ? ' ending ' + s.profile.cardLast4 : ''}` });
  if (r.notes) f.push({ label: 'Notes', value: r.notes });
  return f.filter(x => x.label !== 'Expense Location' && x.label !== 'Town and City');
}

export function buildEmail(r: Receipt, s: Setup): { to: string; subject: string; body: string } {
  const cat = s.categories.find(c => c.id === r.categoryId);
  const { project, account } = findCharge(s, r.charge);
  const charge = project ? `Project ${project.number}` : account ? accountString(s, r.charge, cat?.detailCode || '') : '';
  const subject = [r.description || cat?.name, dmy(r.date), `${r.currency} ${money(r.total)}`, charge].filter(Boolean).join(' | ');
  const lines = oracleFields(r, s).filter(x => x.value).map(x => `${x.label}: ${x.value}`);
  if (r.currency !== s.profile.homeCurrency && r.home != null) lines.push(`Approx. ${s.profile.homeCurrency}: ${money(r.home)}${r.homeEstimate ? ' (estimate)' : ''}`);
  lines.push('', `Charge to: ${chargeLabel(s, r.charge)}`, s.profile.name ? `Claimant: ${s.profile.name}` : '', 'Sent from Claim Prep.');
  return { to: s.profile.oracleEmail, subject, body: lines.filter((l, i) => l || i > 0).join('\n') };
}

/** A short, tidy file name for the attachment, e.g. "2026-10-12 Gerri Taberna EUR 40.74.jpg". */
export function attachmentName(r: Receipt): string {
  const ext = r.fileName.match(/\.[a-z0-9]{2,5}$/i)?.[0] || (r.kind === 'pdf' ? '.pdf' : r.kind === 'docx' ? '.docx' : '.jpg');
  const base = [r.date, r.merchant.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40), r.currency, money(r.total)].filter(Boolean).join(' ');
  return (base || 'receipt') + (r.kind === 'image' ? '.jpg' : ext);
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A coding sheet with one row per receipt, in the columns administrators use. */
export function codingSheet(rs: Receipt[], s: Setup): string {
  const head = ['Date', 'Supplier', 'Description', 'Amount', 'Currency', `Amount ${s.profile.homeCurrency}`, 'Expense type', 'Itemisation', 'Detail code',
    'Cost centre', 'Analysis code', 'SOF', 'Account', 'Project', 'Task', 'Expenditure organisation', 'Approver', 'Trip / report', 'Business reason', 'Paid by', 'Status'];
  const rows = rs.map(r => {
    const cat = s.categories.find(c => c.id === r.categoryId);
    const { account, project } = findCharge(s, r.charge);
    const trip = s.trips.find(t => t.id === r.tripId);
    return [dmy(r.date), r.merchant, r.description, money(r.total), r.currency, money(r.home), cat?.expenseType || '', cat?.itemType || '', cat?.detailCode || '',
      account?.costCentre || project?.costCentre || '', account?.analysis || project?.analysis || '', account?.sof || project?.sof || '',
      accountString(s, r.charge, cat?.detailCode || ''), project?.number || '', project?.task || '', project?.expOrg || '', project?.approver || '',
      trip?.name || '', r.reason, r.paidBy === 'me' ? 'Me (reimburse)' : 'University card', r.status === 'sent' ? `Sent ${r.sentAt.slice(0, 10)}` : 'Not sent'];
  });
  return [head, ...rows].map(row => row.map(v => csvCell(String(v))).join(',')).join('\r\n');
}

/** Oracle needs one report per trip or purpose, and never mixes project and non-project items. */
export function reportGroups(rs: Receipt[], s: Setup): { name: string; project: boolean; items: Receipt[] }[] {
  const groups = new Map<string, { name: string; project: boolean; items: Receipt[] }>();
  for (const r of rs) {
    const { project } = findCharge(s, r.charge);
    const trip = s.trips.find(t => t.id === r.tripId);
    const month = r.date ? new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', '-') : '';
    const name = trip ? trip.name : project ? `${project.label} ${month}` : `Non-project expenses ${month}`;
    const key = `${name}|${project ? 'p' : 'a'}`;
    if (!groups.has(key)) groups.set(key, { name: project && trip ? `${name} (project)` : name, project: !!project, items: [] });
    groups.get(key)!.items.push(r);
  }
  return [...groups.values()];
}
