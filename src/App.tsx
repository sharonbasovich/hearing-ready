import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseBundle } from './types';
import { emptyCase } from './types';
import { db, loadBundle, saveBundle } from './store';
import { buildSampleData } from './sample/sampleCase';
import Stepper, { type StepId } from './components/Stepper';
import CaseStep from './components/CaseStep';
import EvidenceStep from './components/EvidenceStep';
import TimelineStep from './components/TimelineStep';
import ReviewStep from './components/ReviewStep';

export default function App() {
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [step, setStep] = useState<StepId>('case');
  const [loadingSample, setLoadingSample] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadBundle().then((b) => setBundle(b ?? emptyCase()));
  }, []);

  const update = useCallback((next: CaseBundle | ((b: CaseBundle) => CaseBundle)) => {
    setBundle((prev) => {
      const b = typeof next === 'function' ? next(prev!) : next;
      const stamped = { ...b, updatedAt: new Date().toISOString() };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveBundle(stamped), 400);
      return stamped;
    });
  }, []);

  const loadSample = useCallback(async () => {
    setLoadingSample(true);
    try {
      const { bundle: sb, files } = await buildSampleData();
      await db.blobs.clear();
      for (const [id, bytes] of files) {
        await db.blobs.put({ id, data: new Blob([bytes.buffer as ArrayBuffer]) });
      }
      await saveBundle(sb);
      setBundle(sb);
      setStep('evidence');
    } finally {
      setLoadingSample(false);
    }
  }, []);

  const reset = useCallback(async () => {
    if (!window.confirm('Clear the current case and all imported files from this browser?')) return;
    await db.cases.clear();
    await db.blobs.clear();
    setBundle(emptyCase());
    setStep('case');
  }, []);

  if (!bundle) {
    return <div className="app-shell"><div className="topbar"><span className="brand">Hearing-Ready</span></div></div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Hearing-Ready</div>
          <div className="tagline">Local-first LTB evidence bundle compiler</div>
        </div>
        <span className="privacy-pill" title="Uploads are stored in this browser's local database only.">
          Local-first — uploads never leave this device
        </span>
        <div className="spacer" />
        <button className="btn on-dark small" onClick={() => void loadSample()} disabled={loadingSample}>
          {loadingSample ? 'Loading sample…' : 'Load sample case'}
        </button>
        <button className="btn on-dark small" onClick={() => void reset()}>Start over</button>
      </header>

      <div className="layout">
        <Stepper current={step} onNavigate={setStep} />
        <main className="main">
          <div className="banner info">
            Hearing-Ready organizes a <strong>draft bundle for your review</strong>. It does not file anything with the
            LTB and is not legal advice. Verify deadlines and rules on{' '}
            <a href="https://tribunalsontario.ca/ltb/" target="_blank" rel="noreferrer">tribunalsontario.ca/ltb</a>.
          </div>
          {step === 'case' && <CaseStep bundle={bundle} update={update} onNext={() => setStep('evidence')} />}
          {step === 'evidence' && <EvidenceStep bundle={bundle} update={update} onNext={() => setStep('timeline')} onBack={() => setStep('case')} />}
          {step === 'timeline' && <TimelineStep bundle={bundle} update={update} onNext={() => setStep('review')} onBack={() => setStep('evidence')} />}
          {step === 'review' && <ReviewStep bundle={bundle} onBack={() => setStep('timeline')} onJump={setStep} />}
        </main>
      </div>

      <footer className="footer">
        <div>Hearing-Ready is a demo project (LexHack 2026). Synthetic sample data only. Not legal advice.</div>
        <div className="srcs">
          <a href="https://tribunalsontario.ca/ltb/" target="_blank" rel="noreferrer">LTB</a>
          <a href="https://www.ontario.ca/laws/statute/06r17" target="_blank" rel="noreferrer">Residential Tenancies Act, 2006</a>
          <a href="https://open.toronto.ca/dataset/apartment-building-evaluation/" target="_blank" rel="noreferrer">Toronto Open Data — RentSafeTO evaluations</a>
          <a href="https://www.acto.ca/" target="_blank" rel="noreferrer">ACTO</a>
        </div>
      </footer>
    </div>
  );
}
