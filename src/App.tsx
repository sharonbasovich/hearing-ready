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

  const isPristine =
    !bundle.title && !bundle.tenantName && !bundle.unitAddress && !bundle.landlordName &&
    bundle.events.length === 0 && bundle.exhibits.length === 0;

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
          {isPristine && step === 'case' && (
            <section className="card hero" aria-label="Welcome">
              <h2>Scattered photos, texts, and letters → one evidence bundle</h2>
              <p className="sub">
                For Ontario tenants preparing a Landlord and Tenant Board maintenance application (T6) or raising
                issues under s.82 of the Residential Tenancies Act.
              </p>
              <ol className="hero-steps">
                <li><strong>Import</strong> photos, letters, and message exports — each becomes a numbered exhibit with a SHA-256 checksum.</li>
                <li><strong>Pin</strong> what happened to a dated timeline and tag the exhibits that prove each event.</li>
                <li><strong>Export</strong> a paginated PDF: cover, clickable table of contents, timeline with exhibit links, filing reminders.</li>
              </ol>
              <div className="hero-cta">
                <button className="btn primary" onClick={() => void loadSample()} disabled={loadingSample}>
                  {loadingSample ? 'Loading sample…' : 'Try it — load the synthetic sample case'}
                </button>
                <span className="hint">…or fill in your own case details below. Prototype demo — not legal advice.</span>
              </div>
            </section>
          )}
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
