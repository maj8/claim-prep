// Everything the app knows: the person's setup (their details and their own codes) and their receipts.
// Pure TypeScript, shared by the app and the tests.

export type PaidBy = 'card' | 'me';
export type Kind = 'image' | 'pdf' | 'docx';
export type Need = 'meal' | 'route' | 'nights' | 'attendees';

export interface Profile {
  name: string;
  email: string;          // university email the receipts are sent from
  cardLast4: string;      // only the last four digits are ever kept
  homeCurrency: string;
  oracleEmail: string;    // Oracle's receipt address
}

/** A non-project account: Oracle's account string is Company-CostCentre-DetailCode-Analysis-SOF-Spare. */
export interface Account {
  id: string;
  label: string;          // name the person understands, e.g. "My research account"
  company: string;        // 10
  costCentre: string;     // e.g. 10019
  analysis: string;       // e.g. MJAMESYY
  sof: string;            // source of funds, e.g. NDRI
}

/** A grant/project. Oracle also needs the task, expenditure organisation and approver. */
export interface Project {
  id: string;
  label: string;
  number: string;         // project number, e.g. 10000423
  task: string;
  expOrg: string;         // expenditure organisation, e.g. School of Biology (School-wide)
  approver: string;       // approver's email
  costCentre: string;     // cost centre of the project's account, e.g. 10014
  analysis: string;       // usually A0000000
  sof: string;            // usually DOPS
}

/** What was bought, and how Oracle codes it. */
export interface Category {
  id: string;
  name: string;           // e.g. "Meals and drinks while away"
  expenseType: string;    // Oracle expense type
  itemType: string;       // Oracle itemisation type ('' when the type has no itemisation)
  detailCode: string;     // e.g. 431303
  procurement: string;    // Oracle procurement category for purchases ('' if not asked)
  keywords: string;       // comma-separated words that point to this category
  needs: Need[];
  travel: boolean;        // part of a trip (travel, meals, hotel)
}

/** Remembered coding for a supplier, learnt from receipts sent before or added by hand. */
export interface Rule {
  id: string;
  match: string;          // text to look for on the receipt or in the supplier's name
  categoryId: string;
  charge: string;         // 'a:<accountId>' | 'p:<projectId>' | ''
  description: string;
  learned: boolean;
}

export interface Trip {
  id: string;
  name: string;           // e.g. "DigiWaves kick-off meeting, Bilbao"
  start: string;          // YYYY-MM-DD
  end: string;
  charge: string;
  note: string;           // e.g. "to be rejournalled to DigiWaves project"
}

export interface Setup {
  version: 1;
  done: boolean;          // first-run setup finished
  profile: Profile;
  accounts: Account[];
  projects: Project[];
  categories: Category[];
  rules: Rule[];
  trips: Trip[];
  defaultCharge: string;
}

export interface Receipt {
  id: string;
  created: string;
  fileName: string;
  mime: string;
  kind: Kind;
  merchant: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM if printed
  total: number | null;
  currency: string;
  vat: number | null;
  home: number | null;    // amount in home currency
  homeEstimate: boolean;
  categoryId: string;
  charge: string;
  tripId: string;
  description: string;
  reason: string;         // business reason
  paidBy: PaidBy | '';
  meal: string;
  from: string;
  to: string;
  nights: number | null;
  attendees: string;
  notes: string;
  flags: string[];
  auto: string[];         // how the app filled things in, shown so the person can trust or correct it
  text: string;           // text read from the receipt
  status: 'draft' | 'sent';
  sentAt: string;
}

export const ORACLE_EMAIL = 'evkh.fa.expenses.incoming@workflow.email.uk-london-1.ocs.oraclecloud.com';

const c = (id: string, name: string, expenseType: string, itemType: string, detailCode: string, keywords: string,
  o: Partial<Pick<Category, 'needs' | 'travel' | 'procurement'>> = {}): Category =>
  ({ id, name, expenseType, itemType, detailCode, keywords, needs: o.needs || [], travel: !!o.travel, procurement: o.procurement || '' });

// University of St Andrews detail codes as used on Oracle claims in 2026. Each person can change them in Setup.
export const DEFAULT_CATEGORIES: Category[] = [
  c('meal', 'Meals and drinks while away', 'Subsistence/Incidentals', 'Subsistence', '431303',
    'restaurant, restaurante, taberna, bar, pub, cafe, café, coffee, latte, sandwich, lunch, dinner, breakfast, tapas, pintxos, food, kitchen, grill, starbucks, costa, pret, giraffe, caffe nero, greggs, wetherspoon',
    { needs: ['meal'], travel: true }),
  c('hotel', 'Hotel', 'Accommodation - General', 'Accom - Hotel', '431101', 'hotel, hostel, guest house, b&b, inn, lodge, nights, noches, room, folio, check-out, booking.com, airbnb, premier inn, travelodge',
    { needs: ['nights'], travel: true }),
  c('flight', 'Flights', 'Travel', 'Air fares', '431404', 'flight, airline, airways, boarding, easyjet, ryanair, loganair, klm, air france, british airways, vueling, aer lingus, emerald',
    { needs: ['route'], travel: true }),
  c('train', 'Train', 'Travel', 'Train Fares', '431407', 'rail, train, trainline, scotrail, lner, avanti, renfe, crosscountry, tfl, heathrow express', { needs: ['route'], travel: true }),
  c('taxi', 'Taxi', 'Travel', 'Taxi Fares', '431406', 'taxi, cab, uber, bolt, radio taxi, licencia, private hire', { needs: ['route'], travel: true }),
  c('bus', 'Bus, tram, metro or ferry', 'Travel', 'Bus/Tram Fares', '431407', 'bus, coach, tram, metro, subway, underground, stagecoach, citylink, ferry, calmac', { needs: ['route'], travel: true }),
  c('parking', 'Parking', 'Travel', 'Car Parking', '431408', 'parking, car park, airparks, ncp, aparcamiento', { travel: true }),
  c('fuel', 'Fuel', 'Travel', 'Fuel for University hired cars & vans', '419202', 'fuel, petrol, diesel, unleaded, shell, bp, esso, texaco, gulf', { travel: true }),
  c('conf', 'Conference or training fees', 'Training & Conference', 'Conference fees', '431201', 'registration, conference, symposium, workshop, congress, course fee, inscripción', { travel: true }),
  c('hosp', 'Hospitality for guests', 'Hospitality & Entertainment - Externals', '', '431302', 'hospitality, guests, catering, buffet', { needs: ['attendees'] }),
  c('cloud', 'Cloud service or software subscription', 'Purchase of Services (Credit Card only)', '', '418202', 'hosting, server, cloud, saas, netlify, hetzner, dropbox, zoom, github, software, licence, license',
    { procurement: 'Software-as-a-service including Cloud Hosting' }),
  c('subs', 'Subscription or membership', 'Purchase of Services (Credit Card only)', '', '428201', 'subscription, membership, chatgpt, openai, anthropic, claude, annual fee',
    { procurement: 'Institution Professional Associations' }),
  c('web', 'Website or external IT service', 'Purchase of Services (Credit Card only)', '', '426304', 'domain, website, hostinger, ionos, web design', { procurement: 'External IT services' }),
  c('services', 'Other professional services', 'Purchase of Services (Credit Card only)', '', '426305', 'consultancy, professional services, fee', { procurement: 'Other professional services' }),
  c('print', 'Printing (external)', 'Purchase of Services (Credit Card only)', '', '426302', 'printing, print, posters, design unit', { procurement: 'Printing and publications - external' }),
  c('it', 'IT equipment', 'IT Equipment', '', '418102', 'laptop, monitor, keyboard, tablet, computer, desktop, ipad', { procurement: 'Desktop, Laptop, Tablet Purchase inc. Apple' }),
  c('telecom', 'Phones, SIM cards and data', 'IT Equipment', '', '418101', 'sim, hologram, mobile phone, data plan, phone case, telecommunications', { procurement: 'Telecommunications Equipment - Purchase' }),
  c('compcons', 'Computer consumables and peripherals', 'Purchase of Goods (Credit Card only)', '', '414101', 'usb, cable, hdmi, sd card, memory card, ssd, mouse, toner, ink, filament', { procurement: 'Computer consumables and peripherals' }),
  c('labeq', 'Lab or field equipment (small)', 'Purchase of Goods (Credit Card only)', '', '415101', 'battery, charger, camera, antenna, sensor, logger, apparatus, mount, power supply, digikey, mouser, rs components, farnell',
    { procurement: 'Laboratory Small Apparatus and Equipment Purchase' }),
  c('labcons', 'Lab or workshop consumables', 'Purchase of Goods (Credit Card only)', '', '411305', 'consumables, tape, velcro, screws, fuse, boxes, cable ties, screwfix, toolstation', { procurement: 'Laboratory consumables - Workshop materials' }),
  c('post', 'Postage', 'Purchase of Goods (Credit Card only)', '', '414202', 'post office, royal mail, postage, parcelforce, dhl, fedex, ups', { procurement: 'Postage and franking' }),
  c('stationery', 'Stationery', 'Purchase of Goods (Credit Card only)', '', '414203', 'stationery, notebook, pens, paper, folders, ryman', { procurement: 'Stationery' }),
  c('fx', 'Foreign exchange fee', 'Foreign Exchange Fee', '', '429202', 'foreign exchange fee, non-sterling transaction fee'),
];

export const MEALS = ['Breakfast', 'Lunch', 'Dinner'];

export function blankSetup(): Setup {
  return {
    version: 1, done: false,
    profile: { name: '', email: '', cardLast4: '', homeCurrency: 'GBP', oracleEmail: ORACLE_EMAIL },
    accounts: [], projects: [], categories: DEFAULT_CATEGORIES.map(x => ({ ...x, needs: [...x.needs] })), rules: [], trips: [], defaultCharge: '',
  };
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function blankReceipt(fileName: string, mime: string, kind: Kind): Receipt {
  return {
    id: newId(), created: new Date().toISOString(), fileName, mime, kind,
    merchant: '', date: '', time: '', total: null, currency: '', vat: null, home: null, homeEstimate: true,
    categoryId: '', charge: '', tripId: '', description: '', reason: '', paidBy: '', meal: '', from: '', to: '', nights: null,
    attendees: '', notes: '', flags: [], auto: [], text: '', status: 'draft', sentAt: '',
  };
}

// ---- Charges -------------------------------------------------------------------------------

export function findCharge(setup: Setup, charge: string): { account?: Account; project?: Project } {
  if (charge.startsWith('a:')) return { account: setup.accounts.find(a => a.id === charge.slice(2)) };
  if (charge.startsWith('p:')) return { project: setup.projects.find(p => p.id === charge.slice(2)) };
  return {};
}

export function chargeLabel(setup: Setup, charge: string): string {
  const { account, project } = findCharge(setup, charge);
  if (account) return `${account.label} (${account.costCentre} · ${account.analysis})`;
  if (project) return `${project.label} (project ${project.number})`;
  return '';
}

/** Oracle's full account string, e.g. 10-10019-431303-MJAMESYY-NDRI-9999999. */
export function accountString(setup: Setup, charge: string, detailCode: string): string {
  const { account, project } = findCharge(setup, charge);
  const d = detailCode || '______';
  if (account) return [account.company || '10', account.costCentre, d, account.analysis, account.sof, '9999999'].join('-');
  if (project) return ['10', project.costCentre || '_____', d, project.analysis || 'A0000000', project.sof || 'DOPS', '9999999'].join('-');
  return '';
}

// ---- Readiness -----------------------------------------------------------------------------

export type Missing = 'merchant' | 'date' | 'total' | 'currency' | 'category' | 'charge' | 'description' | 'paidBy' | 'meal' | 'attendees';
export const MISSING_LABEL: Record<Missing, string> = {
  merchant: 'supplier', date: 'date', total: 'amount', currency: 'currency', category: 'what it was for',
  charge: 'account or project', description: 'description', paidBy: 'who paid', meal: 'which meal', attendees: 'guests',
};

export function missing(r: Receipt, setup: Setup): Missing[] {
  const q: Missing[] = [];
  const cat = setup.categories.find(x => x.id === r.categoryId);
  if (!r.merchant.trim()) q.push('merchant');
  if (!r.date) q.push('date');
  if (r.total == null || !(r.total > 0)) q.push('total');
  if (!r.currency) q.push('currency');
  if (!cat) q.push('category');
  if (!r.charge || (!findCharge(setup, r.charge).account && !findCharge(setup, r.charge).project)) q.push('charge');
  if (!r.description.trim()) q.push('description');
  if (!r.paidBy) q.push('paidBy');
  if (cat?.needs.includes('meal') && !r.meal) q.push('meal');
  if (cat?.needs.includes('attendees') && !r.attendees.trim()) q.push('attendees');
  return q;
}

/** Oracle's "(Credit Card only)" types cannot be paid back to you: say so, and what to do instead. */
export function cardOnlyWarning(r: Receipt, setup: Setup): string {
  const cat = setup.categories.find(c => c.id === r.categoryId);
  if (r.paidBy !== 'me' || !cat || !/credit card only/i.test(cat.expenseType)) return '';
  return `Oracle only accepts “${cat.expenseType}” for university card payments. If you paid yourself, check with your finance contact how to claim it; goods and services are normally bought through the University's purchasing instead.`;
}

export type Status = 'check' | 'ready' | 'sent';
export function status(r: Receipt, setup: Setup): Status {
  if (r.status === 'sent') return 'sent';
  return missing(r, setup).length ? 'check' : 'ready';
}
