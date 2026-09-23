import { useState } from 'react';
import type { CaseBundle } from '../types';
import { validateBundle } from '../lib/validation';
import { collectFiles } from '../store';
import { generateBundle } from '../pdf/bundle';
import { slugify } from '../lib/bytes';
import type { StepId } from './Stepper';

interface Props {
  bundle: CaseBundle;
  onBack: () => void;
  onJump: (s: StepId) => void;
}

export default function ReviewStep({ bundle, onBack, onJump }: Props) {
  const issues = validateBundle(bundle);
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');
  const [busy, setBusy] = useState(false);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportPdf() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const files = await collectFiles(bundle.exhibits.map((e) => e.id));
      const { bytes, plan } = await generateBundle({ bundle, files });
      setGenWarnings(plan.warnings);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hearing-ready-${slugify(bundle.title || bundle.unitAddress)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setDone(`${bundle.exhibits.length} exhibits · ${plan.pageCount} pages`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="rv-h">
      <div className="card">
        <h2 id="rv-h">Review & export</h2>
        <p className="sub">
          Check the items below, then generate your paginated PDF bundle — cover, table of contents, timeline with
          clickable exhibit chips, numbered exhibit pages, and filing reminders.
        </p>

        {issues.length === 0 && <div className="banner info">No issues found — your bundle is ready to generate.</div>}
        {warnings.length + infos.length > 0 && (
          <ul className="issue-list">
            {[...warnings, ...infos].map((issue, i) => (
              <li key={i} className={issue.severity}>
                <span className="tag">{issue.severity === 'warning' ? 'Check' : 'Note'}</span>
                <button
                  className="btn ghost small"
                  style={{ padding: 0, textAlign: 'left', textDecoration: 'underline' }}
                  onClick={() =>
                    onJump(issue.target.kind === 'case' ? 'case' : issue.target.kind === 'exhibit' ? 'evidence' : 'timeline')
                  }
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card export-box">
        <h2>Generate the PDF bundle</h2>
        <p className="sub" style={{ maxWidth: 560, margin: '0 auto 14px' }}>
          Produced entirely on this device from the data you entered. Open the PDF and read every page before you rely on it.
        </p>
        <button className="btn primary" onClick={() => void exportPdf()} disabled={busy}>
          {busy ? 'Generating…' : 'Generate & download PDF'}
        </button>
        {done && <p className="mono-note">Generated: {done}. Check your downloads folder.</p>}
        {genWarnings.length > 0 && (
          <div className="banner warn" style={{ textAlign: 'left', marginTop: 12 }}>
            {genWarnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
        {error && <div className="banner warn" style={{ textAlign: 'left', marginTop: 12 }}>Export failed: {error}</div>}
        <p className="mono-note">
          Reminder: this bundle is a draft organizer — it does not file anything. Verify disclosure deadlines in the LTB
          Rules of Procedure and your notice of hearing.
        </p>
      </div>

      <div className="step-nav">
        <button className="btn" onClick={onBack}>Back</button>
        <span />
      </div>
    </section>
  );
}
