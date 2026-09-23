export type StepId = 'case' | 'evidence' | 'timeline' | 'review';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'case', label: 'Case details' },
  { id: 'evidence', label: 'Evidence & exhibits' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'review', label: 'Review & export' },
];

export default function Stepper({ current, onNavigate }: { current: StepId; onNavigate: (s: StepId) => void }) {
  return (
    <nav className="stepper" aria-label="Bundle steps">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.id} className={s.id === current ? 'current' : ''}>
            <button
              onClick={() => onNavigate(s.id)}
              aria-current={s.id === current ? 'step' : undefined}
            >
              <span className="num" aria-hidden="true">{i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="note">
        Everything you enter stays in this browser. Only the optional RentSafeTO lookup uses the
        network — and it sends only the street name you type.
      </p>
    </nav>
  );
}
