import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankReceipt, blankSetup, missing, status } from '../src/lib/model';
import type { Setup } from '../src/lib/model';
import { autofill, learn, mealFromTime, supplierKey } from '../src/lib/auto';
import { buildEmail, codingSheet, oracleFields, reportGroups } from '../src/lib/oracle';
import { importCodesCsv, CODES_CSV_TEMPLATE, parseCsv, setupFromJson, setupToJson } from '../src/lib/io';

const TODAY = new Date('2026-10-28T12:00:00Z');

function setup(): Setup {
  const s = blankSetup();
  s.done = true;
  s.profile = { ...s.profile, name: 'Test Person', email: 'tp@st-andrews.ac.uk', cardLast4: '4536' };
  s.accounts = [{ id: 'y', label: 'My research account', company: '10', costCentre: '10019', analysis: 'MJAMESYY', sof: 'NDRI' }];
  s.projects = [{ id: 'ef', label: 'Everyfish', number: '10000423', task: '1', expOrg: 'School of Biology (School-wide)', approver: 'pi@st-andrews.ac.uk', costCentre: '10014', analysis: 'A0000000', sof: 'DOPS' }];
  s.defaultCharge = 'a:y';
  return s;
}

const TAXI = `OSCAR GOMEZ FERNANDEZ
NIF 30640527L
BARAKALDO
FECHA 12/10/2026  HORA 22:41
SERVICIO DE TAXI   35,00
TOTAL   35,00 €
PAGO EFECTIVO`;

const MEAL = `GERRI TABERNA
BILBAO
12/10/2026 21:05
2 PINTXOS 8,00
MENU DEL DIA 30,00
TOTAL 40,74 €
TARJETA **** 4536`;

test('a cash taxi is read, coded as taxi, and marked to be paid back', () => {
  const s = setup();
  const r = autofill(blankReceipt('t.jpg', 'image/jpeg', 'image'), TAXI, s, TODAY);
  assert.equal(r.categoryId, 'taxi');
  assert.equal(r.paidBy, 'me');
  assert.equal(r.total, 35);
  assert.equal(r.charge, 'a:y');
  const f = Object.fromEntries(oracleFields(r, s).map(x => [x.label, x.value]));
  assert.equal(f['Account'], '10-10019-431406-MJAMESYY-NDRI-9999999');
  assert.equal(f['Itemization type'], 'Taxi Fares');
});

test('a meal during a trip goes on the trip account, gets the meal from the time, and the trip note', () => {
  const s = setup();
  s.trips = [{ id: 't1', name: 'DigiWaves kick-off meeting, Bilbao', start: '2026-10-12', end: '2026-10-15', charge: 'a:y', note: 'to be rejournalled to DigiWaves project' }];
  const r = autofill(blankReceipt('m.jpg', 'image/jpeg', 'image'), MEAL, s, TODAY);
  assert.equal(r.categoryId, 'meal');
  assert.equal(r.tripId, 't1');
  assert.equal(r.meal, 'Dinner');
  assert.equal(r.paidBy, 'card');
  assert.equal(r.reason, 'DigiWaves kick-off meeting, Bilbao');
  assert.match(r.description, /^Dinner, Bilbao\. DigiWaves kick-off meeting, Bilbao \(to be rejournalled to DigiWaves project\)$/);
  assert.deepEqual(missing(r, s), []);
  assert.equal(status(r, s), 'ready');
});

test('once sent, a supplier is remembered: the next Hetzner bill is fully coded to the project', () => {
  let s = setup();
  const text = 'Hetzner Online GmbH\nInvoice R0012345\nDate 11/10/2026\nCloud server CPX42\nTotal EUR 78.77';
  let r = autofill(blankReceipt('h.pdf', 'application/pdf', 'pdf'), text, s, TODAY);
  assert.equal(r.categoryId, 'cloud');
  r = { ...r, charge: 'p:ef', description: 'Cloud server for Merra-drift', status: 'sent' };
  s = learn(s, r);
  assert.equal(s.rules.length, 1);
  assert.equal(s.rules[0].match, supplierKey('Hetzner Online GmbH'));
  const next = autofill(blankReceipt('h2.pdf', 'application/pdf', 'pdf'), text.replace('11/10', '11/11').replace('2026-10', '2026-11'), s, new Date('2026-11-20'));
  assert.equal(next.charge, 'p:ef');
  assert.equal(next.description, 'Cloud server for Merra-drift');
  const f = Object.fromEntries(oracleFields(next, s).map(x => [x.label, x.value]));
  assert.equal(f['Project Number'], '10000423');
  assert.equal(f['Account'], '10-10014-418202-A0000000-DOPS-9999999');
  assert.equal(f['Procurement Category'], 'Software-as-a-service including Cloud Hosting');
});

test('email subject and body carry the coding', () => {
  const s = setup();
  const r = autofill(blankReceipt('t.jpg', 'image/jpeg', 'image'), TAXI, s, TODAY);
  const e = buildEmail(r, s);
  assert.equal(e.to, s.profile.oracleEmail);
  assert.match(e.subject, /12\/10\/2026 \| EUR 35\.00 \| 10-10019-431406-MJAMESYY-NDRI-9999999$/);
  assert.match(e.body, /Paid by: Me: to be reimbursed/);
});

test('meal from time', () => {
  assert.equal(mealFromTime('07:58'), 'Breakfast');
  assert.equal(mealFromTime('13:10'), 'Lunch');
  assert.equal(mealFromTime('20:45'), 'Dinner');
  assert.equal(mealFromTime(''), '');
});

test('codes list from a spreadsheet: template loads, re-loading updates instead of doubling', () => {
  const s0 = blankSetup();
  const a = importCodesCsv(s0, CODES_CSV_TEMPLATE);
  assert.equal(a.added, 3);
  assert.equal(a.setup.accounts.length, 2);
  assert.equal(a.setup.projects[0].number, '10000423');
  const b = importCodesCsv(a.setup, CODES_CSV_TEMPLATE);
  assert.equal(b.added, 0); assert.equal(b.updated, 3);
  assert.equal(b.setup.accounts.length, 2);
  // Excel in Europe saves with semicolons.
  assert.deepEqual(parseCsv('kind;name\naccount;"A; B"'), [['kind', 'name'], ['account', 'A; B']]);
});

test('a shared setup leaves out name and card; loading it keeps your own', () => {
  const s = setup();
  const shared = setupToJson(s, false);
  assert.ok(!shared.includes('4536') && !shared.includes('Test Person'));
  const mine = { ...blankSetup(), profile: { ...blankSetup().profile, name: 'Colleague', cardLast4: '1111', email: 'c@st-andrews.ac.uk' } };
  const loaded = setupFromJson(mine, shared);
  assert.equal(loaded.profile.name, 'Colleague');
  assert.equal(loaded.profile.cardLast4, '1111');
  assert.equal(loaded.accounts.length, 1);
});

test('reports never mix project and non-project items; coding sheet has a row each', () => {
  const s = setup();
  const r1 = { ...autofill(blankReceipt('t.jpg', 'image/jpeg', 'image'), TAXI, s, TODAY) };
  const r2 = { ...r1, id: 'x2', charge: 'p:ef' };
  const g = reportGroups([r1, r2], s);
  assert.equal(g.length, 2);
  assert.ok(g.some(x => x.project) && g.some(x => !x.project));
  const csv = codingSheet([r1, r2], s).split('\r\n');
  assert.equal(csv.length, 3);
  assert.match(csv[1], /10-10019-431406-MJAMESYY-NDRI-9999999/);
});

test('no university card: receipts are claimed back to you, and card-only types are flagged', async () => {
  const { cardOnlyWarning } = await import('../src/lib/model');
  const s = setup(); s.profile.cardLast4 = '';
  const meal = autofill(blankReceipt('m.jpg', 'image/jpeg', 'image'), MEAL.replace('TARJETA **** 4536', ''), s, TODAY);
  assert.equal(meal.paidBy, 'me');
  assert.equal(cardOnlyWarning(meal, s), '');
  const cloud = autofill(blankReceipt('h.pdf', 'application/pdf', 'pdf'), 'Hetzner Online GmbH\nDate 11/10/2026\nCloud server\nTotal EUR 78.77', s, TODAY);
  assert.equal(cloud.paidBy, 'me');
  assert.match(cardOnlyWarning(cloud, s), /only accepts/);
  assert.equal(buildEmail(meal, s).body.includes('Paid by: Me: to be reimbursed'), true);
});
