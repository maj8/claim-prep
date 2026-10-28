// Everything is kept on this device only, in the browser's IndexedDB. Nothing is sent anywhere
// except the email you choose to send, and the exchange-rate lookup (currency, date only).
import { createStore, get, set, del, keys, getMany } from 'idb-keyval';
import type { Receipt, Setup } from './model';
import { blankSetup } from './model';

const meta = createStore('claim-prep', 'meta');
const receipts = createStore('claim-prep-receipts', 'receipts');
const files = createStore('claim-prep-files', 'files');
const previews = createStore('claim-prep-previews', 'previews');

export async function loadSetup(): Promise<Setup> {
  const s = await get<Setup>('setup', meta);
  if (!s) return blankSetup();
  // Fill anything added in later versions.
  const b = blankSetup();
  return { ...b, ...s, profile: { ...b.profile, ...s.profile } };
}
export const saveSetup = (s: Setup) => set('setup', s, meta);

export async function loadReceipts(): Promise<Receipt[]> {
  const ks = await keys(receipts);
  const all = (await getMany<Receipt>(ks, receipts)).filter((r): r is Receipt => !!r);
  return all.sort((a, b) => (b.date || b.created).localeCompare(a.date || a.created));
}
export const saveReceipt = (r: Receipt) => set(r.id, r, receipts);
export async function deleteReceipt(id: string) {
  await Promise.all([del(id, receipts), del(id, files), del(id, previews)]);
}

export const saveFile = (id: string, b: Blob) => set(id, b, files);
export const getFile = (id: string) => get<Blob>(id, files);
export const savePreview = (id: string, b: Blob) => set(id, b, previews);
export const getPreview = (id: string) => get<Blob>(id, previews);

export const fxGet = (k: string) => get<number>('fx:' + k, meta);
export const fxSet = (k: string, v: number) => set('fx:' + k, v, meta);

/** Files shared into the app from another app (Android "Share" → Claim Prep), parked by the service worker. */
const inbox = createStore('claim-prep-inbox', 'inbox');
export async function takeInbox(): Promise<File[]> {
  const ks = await keys(inbox);
  const out = (await getMany<File>(ks, inbox)).filter((f): f is File => !!f);
  await Promise.all(ks.map(k => del(k, inbox)));
  return out;
}

/** Ask the browser not to clear the app's data when the phone is short of space. */
export async function persist(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false; } catch { return false; }
}
