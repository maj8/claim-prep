import { useState } from 'preact/hooks';
import type { Api } from '../app';
import type { Trip } from '../lib/model';
import { chargeLabel, newId } from '../lib/model';
import { applyCoding, tripFor } from '../lib/auto';
import { Select, Sheet, Text, fmtDate, fmtMoney, toast } from './bits';
import { chargeOptions } from './ReceiptView';

export default function TripsTab({ api }: { api: Api }) {
  const s = api.setup;
  const [edit, setEdit] = useState<Trip | null>(null);
  const trips = [...s.trips].sort((a, b) => b.start.localeCompare(a.start));

  const save = (t: Trip) => {
    if (!t.name.trim() || !t.start || !t.end) { toast('A trip needs a name and dates.'); return; }
    const next = { ...s, trips: [...s.trips.filter(x => x.id !== t.id), t] };
    api.saveSetup(next);
    // Recode unsent travel receipts in the trip's dates that are not already on another trip.
    let n = 0;
    for (const r of api.receipts) {
      if (r.status === 'sent') continue;
      const cat = s.categories.find(c => c.id === r.categoryId);
      if (cat && !cat.travel) continue;
      if (r.tripId && r.tripId !== t.id) continue;
      if (tripFor([t], r.date)) {
        api.update(applyCoding({ ...r, tripId: t.id, charge: t.charge || r.charge, reason: t.name, description: '', auto: [...r.auto, `Added to the trip “${t.name}”.`] }, next));
        n++;
      }
    }
    setEdit(null);
    toast(n ? `Trip saved. ${n} receipt${n === 1 ? '' : 's'} in those dates added to it.` : 'Trip saved.');
  };

  return (
    <main>
      <header class="top"><h1>Trips</h1></header>
      <p class="tip">Add a trip before or after you travel. Travel, hotel and meal receipts dated during it are put on the trip's account and given its business reason, and they become one Oracle report.</p>
      <button class="primary big" onClick={() => setEdit({ id: newId(), name: '', start: '', end: '', charge: s.defaultCharge, note: '' })}>Add a trip</button>
      <ul class="list">
        {trips.map(t => {
          const items = api.receipts.filter(r => r.tripId === t.id);
          const total = items.reduce((a, r) => a + (r.home ?? (r.currency === s.profile.homeCurrency ? r.total || 0 : 0)), 0);
          return (
            <li class="item" onClick={() => setEdit(t)}>
              <div class="body">
                <div class="line1"><b>{t.name}</b><span class="amt">{items.length ? fmtMoney(total, s.profile.homeCurrency) : ''}</span></div>
                <div class="line2">{fmtDate(t.start)} – {fmtDate(t.end)} · {items.length} receipt{items.length === 1 ? '' : 's'}</div>
                <div class="line2">{chargeLabel(s, t.charge) || <i>No account chosen</i>}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {edit && (
        <Sheet title={s.trips.some(x => x.id === edit.id) ? 'Edit trip' : 'New trip'} onClose={() => setEdit(null)}>
          <Text label="Trip name (becomes the Oracle report name)" value={edit.name} placeholder="e.g. Project meeting, Bilbao" onInput={v => setEdit({ ...edit, name: v })} />
          <div class="two">
            <Text label="First day" type="date" value={edit.start} onInput={v => setEdit({ ...edit, start: v, end: edit.end || v })} />
            <Text label="Last day" type="date" value={edit.end} onInput={v => setEdit({ ...edit, end: v })} />
          </div>
          <Select label="Charge the trip to" value={edit.charge} options={chargeOptions(s)} onChange={v => setEdit({ ...edit, charge: v })} />
          <Text label="Note added to each description (optional)" value={edit.note} placeholder="e.g. to be rejournalled to the project when its code is set up" onInput={v => setEdit({ ...edit, note: v })} />
          <div class="row">
            {s.trips.some(x => x.id === edit.id) && <button class="danger" onClick={() => {
              api.saveSetup({ ...s, trips: s.trips.filter(x => x.id !== edit.id) });
              api.receipts.filter(r => r.tripId === edit.id && r.status !== 'sent').forEach(r => api.update({ ...r, tripId: '' }));
              setEdit(null);
            }}>Delete trip</button>}
            <button class="primary" onClick={() => save(edit)}>Save trip</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
