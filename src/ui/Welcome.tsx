import { useState } from 'preact/hooks';
import type { Api } from '../app';
import type { Account, Project, Setup } from '../lib/model';
import { newId } from '../lib/model';
import { AccountForm, ProfileForm, ProjectForm, useImport } from './SetupTab';
import { toast } from './bits';

export default function Welcome({ api }: { api: Api }) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Setup>(api.setup);
  const [adding, setAdding] = useState<'' | 'account' | 'project'>('');
  const [acc, setAcc] = useState<Account>({ id: newId(), label: '', company: '10', costCentre: '', analysis: '', sof: '' });
  const [prj, setPrj] = useState<Project>({ id: newId(), label: '', number: '', task: '1', expOrg: '', approver: '', costCentre: '', analysis: 'A0000000', sof: 'DOPS' });
  const imp = useImport(api, () => s, n => setS(n));
  const p = s.profile;

  const finish = () => { api.saveSetup({ ...s, done: true }); toast('All set. Take a photo of a receipt to start.'); };

  return (
    <main class="welcome">
      <h1>Claim Prep</h1>
      {step === 0 && <>
        <p class="lead">Photograph or upload a receipt. The app reads it, codes it with your own accounts and projects, and gets it into an email to Oracle.</p>
        <ul class="plain ticks">
          <li>Works on Android and iPhone, and on a computer.</li>
          <li>Everything stays on this phone. There is no account to create.</li>
          <li>Two minutes of setup, then most receipts need only a check.</li>
        </ul>
        <button class="primary big" onClick={() => setStep(1)}>Set up</button>
        <button class="quiet" onClick={imp.open}>I have a setup file or codes list</button>
        {imp.el}
      </>}

      {step === 1 && <>
        <h2>1. About you</h2>
        <ProfileForm s={s} onChange={setS} />
        <div class="row">
          <button onClick={() => setStep(0)}>Back</button>
          <button class="primary" disabled={!p.name.trim() || !/@/.test(p.email)} onClick={() => setStep(2)}>Next</button>
        </div>
        {(!p.name.trim() || !/@/.test(p.email)) && <p class="tip">Your name and university email are needed.</p>}
      </>}

      {step === 2 && <>
        <h2>2. What you charge expenses to</h2>
        <p class="tip">Add the accounts (cost centre and analysis code) and the projects you use. You'll pick from these by name, so you never type a code again. You can add more later in Setup.</p>
        <ul class="plain rows">
          {s.accounts.map(a => <li><b>{a.label}</b><span>{a.costCentre} · {a.analysis} · {a.sof}</span></li>)}
          {s.projects.map(x => <li><b>{x.label}</b><span>Project {x.number}</span></li>)}
        </ul>
        {!adding && <div class="row wrap">
          <button onClick={() => setAdding('account')}>Add an account</button>
          <button onClick={() => setAdding('project')}>Add a project</button>
          <button class="quiet" onClick={imp.open}>Load a list from a file</button>
        </div>}
        {imp.el}
        {adding === 'account' && <div class="card">
          <AccountForm a={acc} onChange={setAcc} />
          <div class="row">
            <button onClick={() => setAdding('')}>Cancel</button>
            <button class="primary" onClick={() => {
              if (!acc.costCentre || !acc.analysis) { toast('An account needs a cost centre and an analysis code.'); return; }
              const a = { ...acc, label: acc.label || `${acc.costCentre} ${acc.analysis}` };
              setS({ ...s, accounts: [...s.accounts, a], defaultCharge: s.defaultCharge || 'a:' + a.id });
              setAcc({ id: newId(), label: '', company: '10', costCentre: '', analysis: '', sof: '' }); setAdding('');
            }}>Add</button>
          </div>
        </div>}
        {adding === 'project' && <div class="card">
          <ProjectForm p={prj} onChange={setPrj} />
          <div class="row">
            <button onClick={() => setAdding('')}>Cancel</button>
            <button class="primary" onClick={() => {
              if (!prj.number) { toast('A project needs its project number.'); return; }
              const x = { ...prj, label: prj.label || `Project ${prj.number}` };
              setS({ ...s, projects: [...s.projects, x], defaultCharge: s.defaultCharge || 'p:' + x.id });
              setPrj({ id: newId(), label: '', number: '', task: '1', expOrg: '', approver: '', costCentre: '', analysis: 'A0000000', sof: 'DOPS' }); setAdding('');
            }}>Add</button>
          </div>
        </div>}
        <div class="row">
          <button onClick={() => setStep(1)}>Back</button>
          <button class="primary" onClick={finish}>{s.accounts.length + s.projects.length ? 'Finish' : 'Skip for now'}</button>
        </div>
      </>}
    </main>
  );
}
