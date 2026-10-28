import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Receipt, Setup } from './lib/model';
import { blankReceipt, status } from './lib/model';
import { applyCoding, autofill, learn } from './lib/auto';
import { importFile, kindOf } from './lib/read';
import { toHome } from './lib/fx';
import { deleteReceipt, loadReceipts, loadSetup, persist, saveFile, savePreview, saveReceipt, saveSetup, takeInbox } from './lib/store';
import { sendReceipt } from './lib/send';
import { Toaster, toast } from './ui/bits';
import ReceiptsTab from './ui/ReceiptsTab';
import ReceiptView from './ui/ReceiptView';
import TripsTab from './ui/TripsTab';
import SetupTab from './ui/SetupTab';
import Welcome from './ui/Welcome';

export type Tab = 'receipts' | 'trips' | 'setup';

export interface Api {
  setup: Setup;
  receipts: Receipt[];
  busy: Record<string, string>;
  saveSetup: (s: Setup) => void;
  update: (r: Receipt) => void;
  recode: (r: Receipt) => void;
  addFiles: (fs: FileList | File[]) => void;
  remove: (id: string) => void;
  send: (r: Receipt) => Promise<void>;
  open: (id: string) => void;
  go: (t: Tab) => void;
}

export default function App() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('receipts');
  const [openId, setOpenId] = useState('');
  const [confirm, setConfirm] = useState<Receipt | null>(null);

  useEffect(() => {
    (async () => {
      const [s, rs] = await Promise.all([loadSetup(), loadReceipts()]);
      setSetup(s); setReceipts(rs);
      persist();
    })();
  }, []);

  // Files shared into the app from email, Files or Downloads (Android: Share → Claim Prep).
  useEffect(() => {
    if (!setup?.done) return;
    takeInbox().then(fs => { if (fs.length) { api.addFiles(fs); history.replaceState(null, '', location.pathname); } });
  }, [setup?.done]);

  // Back button closes a receipt instead of leaving the app.
  useEffect(() => {
    const onPop = () => setOpenId('');
    addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop);
  }, []);

  const put = (r: Receipt) => { setReceipts(rs => { const i = rs.findIndex(x => x.id === r.id); const out = [...rs]; if (i >= 0) out[i] = r; else out.unshift(r); return out; }); saveReceipt(r); };

  const api: Api = useMemo(() => ({
    setup: setup!, receipts, busy,
    saveSetup: (s) => { setSetup(s); saveSetup(s); },
    update: (r) => put(r),
    recode: (r) => {
      const cleared = { ...r, categoryId: '', charge: '', tripId: '', description: '', reason: '', meal: '', auto: [] };
      put(r.text ? autofill(cleared, r.text, setup!) : applyCoding(cleared, setup!));
      toast('Filled in again from your rules and trips.');
    },
    addFiles: async (list) => {
      const files = Array.from(list).filter(f => { if (kindOf(f)) return true; toast(`${f.name} is not a photo, PDF or Word file.`); return false; });
      if (!files.length) return;
      setTab('receipts');
      let lastId = '';
      for (const f of files) {
        const kind = kindOf(f)!;
        let r = blankReceipt(f.name || 'receipt', f.type, kind);
        lastId = r.id;
        put(r);
        const say = (m: string) => setBusy(b => ({ ...b, [r.id]: m }));
        say('Starting…');
        try {
          const im = await importFile(f, say);
          await saveFile(r.id, im.stored);
          if (im.preview) await savePreview(r.id, im.preview);
          r = { ...r, mime: im.mime };
          r = autofill(r, im.text, setup!);
          if (im.problem) r.flags = [...r.flags, im.problem];
          if (!im.text.trim() && !im.problem) r.flags = [...r.flags, 'No text could be read. Fill the fields in from the receipt.'];
          if (r.total != null && r.currency) {
            say('Working out the sterling amount…');
            const h = await toHome(r.total, r.currency, r.date, setup!.profile.homeCurrency);
            if (h) r = { ...r, home: h.value, homeEstimate: h.estimate };
          }
          put(r);
        } catch (e: any) {
          r = { ...r, flags: [String(e?.message || e)] }; put(r);
        } finally {
          setBusy(b => { const { [r.id]: _, ...rest } = b; return rest; });
        }
      }
      if (files.length === 1) { setOpenId(lastId); history.pushState({ r: lastId }, ''); }
      toast(files.length === 1 ? 'Receipt read.' : `${files.length} receipts read.`);
    },
    remove: (id) => { setReceipts(rs => rs.filter(r => r.id !== id)); deleteReceipt(id); setOpenId(''); },
    send: async (r) => {
      try {
        const res = await sendReceipt(r, setup!);
        if (res === 'cancelled') { toast('Not sent.'); return; }
        toast(res === 'shared' ? 'Oracle’s address is copied. Paste it into the To line.' : 'Receipt saved. Attach it to the email that opened.');
        setTimeout(() => setConfirm(r), 800);
      } catch (e: any) { toast(String(e?.message || e)); }
    },
    open: (id) => { setOpenId(id); history.pushState({ r: id }, ''); },
    go: (t) => { setTab(t); setOpenId(''); },
  }), [setup, receipts, busy]);

  if (!setup) return <div class="splash">Claim Prep</div>;
  if (!setup.done) return <><Welcome api={api} /><Toaster /></>;

  const open = receipts.find(r => r.id === openId);
  const toCheck = receipts.filter(r => status(r, setup) === 'check').length;

  return (
    <div class="app">
      {open ? <ReceiptView api={api} r={open} onBack={() => history.back()} /> : (
        <>
          {tab === 'receipts' && <ReceiptsTab api={api} />}
          {tab === 'trips' && <TripsTab api={api} />}
          {tab === 'setup' && <SetupTab api={api} />}
          <nav class="tabs">
            <button class={tab === 'receipts' ? 'on' : ''} onClick={() => setTab('receipts')}>Receipts{toCheck ? <span class="dot">{toCheck}</span> : null}</button>
            <button class={tab === 'trips' ? 'on' : ''} onClick={() => setTab('trips')}>Trips</button>
            <button class={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>Setup</button>
          </nav>
        </>
      )}
      {confirm && (
        <div class="sheet-bg"><div class="sheet small">
          <h2>Did the email go?</h2>
          <p>Mark this receipt as sent to Oracle. Its coding is remembered for this supplier next time.</p>
          <div class="row">
            <button onClick={() => setConfirm(null)}>Not yet</button>
            <button class="primary" onClick={() => {
              const r = { ...confirm, status: 'sent' as const, sentAt: new Date().toISOString() };
              put(r); api.saveSetup(learn(setup, r)); setConfirm(null); toast('Marked as sent.');
            }}>Yes, sent</button>
          </div>
        </div></div>
      )}
      <Toaster />
    </div>
  );
}
