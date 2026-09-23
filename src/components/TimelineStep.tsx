import { useState } from 'react';
import type { CaseBundle, TimelineEvent } from '../types';
import { formatEventDate, sortEvents } from '../lib/dates';
import { exhibitNumber } from '../lib/exhibits';
import { uuid } from '../lib/bytes';

interface Props {
  bundle: CaseBundle;
  update: (fn: (b: CaseBundle) => CaseBundle) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function TimelineStep({ bundle, update, onNext, onBack }: Props) {
  const sorted = sortEvents(bundle.events);

  function addEvent() {
    const ev: TimelineEvent = {
      id: uuid(),
      date: null,
      precision: 'day',
      title: '',
      details: '',
      exhibitIds: [],
    };
    update((b) => ({ ...b, events: [...b.events, ev] }));
  }

  const patch = (id: string, p: Partial<TimelineEvent>) =>
    update((b) => ({ ...b, events: b.events.map((e) => (e.id === id ? { ...e, ...p } : e)) }));

  const toggleChip = (ev: TimelineEvent, exId: string) =>
    patch(ev.id, {
      exhibitIds: ev.exhibitIds.includes(exId) ? ev.exhibitIds.filter((x) => x !== exId) : [...ev.exhibitIds, exId],
    });

  const remove = (id: string) => update((b) => ({ ...b, events: b.events.filter((e) => e.id !== id) }));

  return (
    <section className="card" aria-labelledby="tl-h">
      <h2 id="tl-h">Timeline</h2>
      <p className="sub">
        Add dated events in plain language — facts only. Tag each event with the exhibits that support it; those become
        clickable chips (E1, E2…) in the PDF. Undated events are flagged in review.
      </p>

      {sorted.length === 0 && <div className="empty">No events yet. Add your first dated event below.</div>}

      {sorted.map((ev) => (
        <EventCard
          key={ev.id}
          ev={ev}
          bundle={bundle}
          onPatch={patch}
          onToggleChip={toggleChip}
          onRemove={remove}
        />
      ))}

      <button className="btn" onClick={addEvent}>+ Add event</button>

      <div className="step-nav">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={onNext}>Next: review & export</button>
      </div>
    </section>
  );
}

function EventCard({
  ev,
  bundle,
  onPatch,
  onToggleChip,
  onRemove,
}: {
  ev: TimelineEvent;
  bundle: CaseBundle;
  onPatch: (id: string, p: Partial<TimelineEvent>) => void;
  onToggleChip: (ev: TimelineEvent, exId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [undated, setUndated] = useState(ev.date === null);
  return (
    <div className="event-card">
      <div className="event-head">
        <span className={`event-date${ev.date ? '' : ' missing'}`}>{formatEventDate(ev)}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13 }}>
            Precision:{' '}
            <select
              value={ev.precision}
              onChange={(e) => {
                const precision = e.target.value as 'day' | 'month';
                let date = ev.date;
                if (precision === 'month' && date && date.length === 10) date = date.slice(0, 7);
                if (precision === 'day' && date && date.length === 7) date = `${date}-01`;
                onPatch(ev.id, { precision, date });
              }}
              aria-label="Date precision"
            >
              <option value="day">Exact day</option>
              <option value="month">Month only</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={undated}
              onChange={(e) => {
                setUndated(e.target.checked);
                if (e.target.checked) onPatch(ev.id, { date: null });
              }}
            />{' '}
            Date unknown
          </label>
        </div>
        {!undated &&
          (ev.precision === 'day' ? (
            <input
              type="date"
              value={ev.date ?? ''}
              onChange={(e) => onPatch(ev.id, { date: e.target.value || null })}
              aria-label="Event date"
              style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '6px 9px', font: 'inherit', fontSize: 13.5 }}
            />
          ) : (
            <input
              type="month"
              value={ev.date ?? ''}
              onChange={(e) => onPatch(ev.id, { date: e.target.value || null })}
              aria-label="Event month"
              style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '6px 9px', font: 'inherit', fontSize: 13.5 }}
            />
          ))}
        <button className="btn small danger" style={{ marginLeft: 'auto' }} onClick={() => onRemove(ev.id)} aria-label="Delete event">
          Delete
        </button>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor={`t-${ev.id}`}>Short title</label>
        <input id={`t-${ev.id}`} type="text" value={ev.title} onChange={(e) => onPatch(ev.id, { title: e.target.value })} placeholder="e.g. Leak reported to building manager" />
      </div>
      <div className="field">
        <label htmlFor={`d-${ev.id}`}>What happened — factual sentences</label>
        <textarea id={`d-${ev.id}`} value={ev.details} onChange={(e) => onPatch(ev.id, { details: e.target.value })}
          placeholder="What you observed, who you told, what was said. Facts, not opinions." />
      </div>

      <div>
        <span style={{ fontSize: 13, fontWeight: 650 }}>Supporting exhibits:</span>
        <div className="chip-row">
          {bundle.exhibits.map((ex) => {
            const n = exhibitNumber(bundle, ex.id)!;
            const on = ev.exhibitIds.includes(ex.id);
            return (
              <button
                key={ex.id}
                className={`chip-toggle${on ? ' on' : ''}`}
                onClick={() => onToggleChip(ev, ex.id)}
                aria-pressed={on}
                title={ex.fileName}
              >
                E{n}
              </button>
            );
          })}
          {bundle.exhibits.length === 0 && <span className="exhibit-meta">Add exhibits on the previous step first.</span>}
        </div>
      </div>
    </div>
  );
}
