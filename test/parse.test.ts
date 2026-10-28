import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, toNumber, findDate, docxXmlToText, linesFromBoxes } from '../src/lib/parse';

const TODAY = new Date('2026-10-20T12:00:00Z');

test('numbers in UK, Spanish and US formats', () => {
  assert.equal(toNumber('31,90'), 31.9);
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('1,234.56'), 1234.56);
  assert.equal(toNumber('£4.35'), 4.35);
  assert.equal(toNumber('382,68 €'), 382.68);
});

test('dates are read day first and never in the future', () => {
  assert.equal(findDate('FECHA 12/10/2026', TODAY), '2026-10-12');
  assert.equal(findDate('13-10-26 21:14', TODAY), '2026-10-13');
  assert.equal(findDate('Invoice date Oct 13, 2026', TODAY), '2026-10-13');
  assert.equal(findDate('10 de octubre de 2026', TODAY), '2026-10-10');
  assert.equal(findDate('2026-10-11', TODAY), '2026-10-11');
  assert.equal(findDate('Expiry 12/31/2027', TODAY), '');
});

test('Spanish taxi receipt paid in cash', () => {
  const r = parseReceipt(`OSCAR GOMEZ FERNANDEZ
NIF 30640527L
BARAKALDO
FECHA 12/10/2026  HORA 22:41
SERVICIO DE TAXI   35,00
BASE IMPONIBLE   31,82
IVA 10%   3,18
TOTAL   35,00 €
PAGO EFECTIVO`, TODAY);
  assert.equal(r.merchant, 'Oscar Gomez Fernandez');
  assert.equal(r.date, '2026-10-12');
  assert.equal(r.total, 35);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.vat, 3.18);
  assert.equal(r.expenseType, 'Travel');
  assert.equal(r.paidCash, true);
  assert.match(r.description, /^Taxi, Barakaldo/);
  assert.equal(r.confidence, 'high');
});

test('card slip from a restaurant with a tip line', () => {
  const r = parseReceipt(`BBVA
RESTAURANTE MANDOYA
BILBAO
COMERCIO 0012345
TARJETA **** **** **** 4536
13/10/26 14:02
VENTA
IMPORTE EUR 22,00
IMPORTE PROPINA 2,02
COPIA CLIENTE`, TODAY);
  assert.equal(r.merchant, 'Restaurante Mandoya');
  assert.equal(r.total, 22);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.cardLast4, '4536');
  assert.equal(r.expenseType, 'Subsistence/Incidentals');
  assert.ok(r.flags.some((f: string) => /tip/i.test(f)));
});

test('UK airport coffee in pounds', () => {
  const r = parseReceipt(`Giraffe Edinburgh
Airside Departure Lounge
VAT No 527 7900 69
12/10/2026 06:58
Flat White 4.35
TOTAL £4.35
VAT 20% 0.73
Visa ending 4536`, TODAY);
  assert.equal(r.merchant, 'Giraffe Edinburgh');
  assert.equal(r.total, 4.35);
  assert.equal(r.currency, 'GBP');
  assert.equal(r.vat, 0.73);
  assert.equal(r.cardLast4, '4536');
  assert.equal(r.expenseType, 'Subsistence/Incidentals');
});

test('online invoice in dollars is recognised as a service', () => {
  const r = parseReceipt(`Netlify, Inc.
Invoice
Invoice date Oct 13, 2026
Pro plan  $9.00
Amount paid $9.00`, TODAY);
  assert.equal(r.merchant, 'Netlify');
  assert.equal(r.total, 9);
  assert.equal(r.currency, 'USD');
  assert.equal(r.expenseType, 'Purchase of Services (Credit Card only)');
  assert.equal(r.description, 'Website hosting');
});

test('hotel folio picks the grand total, counts nights and flags the minibar', () => {
  const r = parseReceipt(`HOTEL SERCOTEL ARENAL BILBAO
Factura / Invoice
Check-out 13/10/2026
Habitación 3 noches  330,00
Minibar  12,68
Tasa turística  40,00
Base imponible  347,89
IVA 10%  34,79
TOTAL A PAGAR  382,68 €`, TODAY);
  assert.equal(r.total, 382.68);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.expenseType, 'Accommodation - General');
  assert.equal(r.nights, 3);
  assert.equal(r.description, 'Hotel, 3 nights, Bilbao');
  assert.ok(r.flags.some((f: string) => /minibar/i.test(f)));
});

test('Word document text and OCR line rebuilding', () => {
  assert.equal(docxXmlToText('<w:p><w:r><w:t>Trainline</w:t></w:r></w:p><w:p><w:r><w:t>Total &amp; paid £34.09</w:t></w:r></w:p>'), 'Trainline\nTotal & paid £34.09');
  const t = linesFromBoxes([
    { text: '35,00', top: 101, left: 300, height: 20 },
    { text: 'TOTAL', top: 100, left: 10, height: 20 },
    { text: 'TAXI', top: 10, left: 10, height: 20 },
  ]);
  assert.equal(t, 'TAXI\nTOTAL  35,00');
});

test('real Netlify receipt layout (text as extracted from the PDF, personal details removed)', () => {
  const t = `RECEIPT
Netlify, Inc.
PO BOX 7775
San Francisco, CA 94120
United States
Bill to:  Invoice number  EKLGID-00008
Receipt date  Oct 13, 2026
Payment date  Oct 13, 2026
Amount paid  $9.00
Description  Quantity  Rate  Amount
Bandwidth (GB)  0.017234  20 credits  0.34467464
Sep 12 – Oct 11, 2026  credits
DB Compute  8.146667  10 credits  81.46666667
Members  1  $9.00  $9.00
Oct 12 – Nov 11, 2026
Subtotal  $9.00
Amount paid  $9.00`;
  const r = parseReceipt(t, TODAY);
  assert.equal(r.merchant, 'Netlify');
  assert.equal(r.date, '2026-10-13');
  assert.equal(r.total, 9);
  assert.equal(r.currency, 'USD');
  assert.equal(r.expenseType, 'Purchase of Services (Credit Card only)');
});

test('amounts survive common text-recognition slips', async () => {
  const { amountsIn } = await import('../src/lib/parse');
  assert.deepEqual(amountsIn('TOTAL £4 .35'), [4.35]);
  assert.deepEqual(amountsIn('TOTAL 4·35'), [4.35]);
  assert.deepEqual(amountsIn('Total 1 234,56 €'), [1234.56]);
});

test('a total that does not add up is flagged (crinkled receipt read 35.55 as 35.95)', () => {
  const r = parseReceipt(`CAFE BAR LUNA
12/10/2026
BASE IMPONIBLE  32,32
IVA 10%  3,23
TOTAL  35,95 €`, TODAY);
  assert.equal(r.total, 35.95);
  assert.match(r.flags[0], /subtotal 32\.32 \+ VAT 3\.23 = 35\.55/);
});
