import { useRef, useState } from 'react';
import type { CaseBundle, Exhibit } from '../types';
import { classifyFile, exhibitNumber, exhibitSourceLabel, formatBytes, kindLabel, moveExhibit, removeExhibit } from '../lib/exhibits';
import { sha256Hex, shortHash, uuid } from '../lib/bytes';
import { putFile, deleteFile } from '../store';
import { searchBuildings, checkAddressMatch, type BuildingRecord, type RentSafeResult, DATASET_PAGE_URL } from '../rentsafe';

interface Props {
  bundle: CaseBundle;
  update: (fn: (b: CaseBundle) => CaseBundle) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function EvidenceStep({ bundle, update, onNext, onBack }: Props) {
  const [drag, setDrag] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const linked = new Map<string, number>();
  for (const ev of bundle.events) for (const id of ev.exhibitIds) linked.set(id, (linked.get(id) ?? 0) + 1);

  async function importFiles(list: Iterable<File>) {
    const added: Exhibit[] = [];
    for (const file of list) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      const kind = classifyFile(file.name, file.type);
      const ex: Exhibit = {
        id: uuid(),
        fileName: file.name,
        kind,
        source: 'tenant-upload',
        mimeType: file.type || 'application/octet-stream',
        byteSize: bytes.length,
        sha256: sha,
        description: '',
        createdAt: new Date().toISOString(),
        capturedDate: null,
        textContent: kind === 'text' ? new TextDecoder().decode(bytes).slice(0, 200_000) : undefined,
      };
      await putFile(ex.id, file);
      added.push(ex);
    }
    if (added.length) update((b) => ({ ...b, exhibits: [...b.exhibits, ...added] }));
  }

  async function addNote() {
    if (!noteText.trim()) return;
    const text = `Note: ${noteTitle.trim() || 'Untitled'}\n\n${noteText}`;
    const bytes = new TextEncoder().encode(text);
    const ex: Exhibit = {
      id: uuid(),
      fileName: `${(noteTitle.trim() || 'typed-note').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`,
      kind: 'note',
      source: 'tenant-note',
      mimeType: 'text/plain',
      byteSize: bytes.length,
      sha256: await sha256Hex(bytes),
      description: '',
      createdAt: new Date().toISOString(),
      capturedDate: null,
      textContent: noteText,
    };
    await putFile(ex.id, new Blob([bytes], { type: 'text/plain' }));
    update((b) => ({ ...b, exhibits: [...b.exhibits, ex] }));
    setNoteTitle('');
    setNoteText('');
    setNoteOpen(false);
  }

  function remove(id: string) {
    void deleteFile(id);
    update((b) => removeExhibit(b, id));
  }

  return (
    <section aria-labelledby="ev-h">
      <div className="card">
        <h2 id="ev-h">Evidence & exhibits</h2>
        <p className="sub">
          Import photos, PDFs, and text or message exports — or type a note. Files stay in this browser (IndexedDB);
          nothing is uploaded. Each item gets an exhibit number used across the timeline and PDF.
        </p>

        <div
          className={`dropzone${drag ? ' drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void importFiles(e.dataTransfer.files); }}
        >
          <p><strong>Drag files here</strong> or</p>
          <button className="btn" onClick={() => fileInput.current?.click()}>Choose files</button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,.pdf,.txt,.md,.csv,.json,.log"
            onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.target.value = ''; }}
            aria-label="Choose evidence files"
          />
          <p className="hint">Supported: images, PDF, and plain-text files (message exports, notes).</p>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setNoteOpen((v) => !v)}>{noteOpen ? 'Close note editor' : 'Add a typed note'}</button>
        </div>

        {noteOpen && (
          <div className="card" style={{ marginTop: 12, background: '#fafbfc' }}>
            <div className="field">
              <label htmlFor="note-title">Note title</label>
              <input id="note-title" type="text" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g. Phone call with superintendent" />
            </div>
            <div className="field">
              <label htmlFor="note-text">What happened — facts only</label>
              <textarea id="note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Dates, who said what, what you observed…" />
            </div>
            <button className="btn primary" onClick={() => void addNote()} disabled={!noteText.trim()}>Add note as exhibit</button>
          </div>
        )}
      </div>

      <RentSafePanel update={update} caseAddress={bundle.unitAddress} />

      <div className="card">
        <h3>Exhibits ({bundle.exhibits.length})</h3>
        {bundle.exhibits.length === 0 && <div className="empty">No exhibits yet — import files, add a note, or load the sample case.</div>}
        {bundle.exhibits.map((ex) => {
          const n = exhibitNumber(bundle, ex.id)!;
          const refs = linked.get(ex.id) ?? 0;
          return (
            <div className="exhibit-card" key={ex.id}>
              <div className="exhibit-head">
                <span className={`chip${ex.source === 'public-data' ? ' public' : ''}`}>E{n}</span>
                <span className="exhibit-name">{ex.fileName}</span>
                <span className="exhibit-meta">{kindLabel(ex.kind)} · {exhibitSourceLabel(ex)} · {formatBytes(ex.byteSize)}</span>
                <div className="exhibit-actions">
                  <button className="btn small" aria-label={`Move exhibit ${n} earlier`} onClick={() => update((b) => ({ ...b, exhibits: moveExhibit(b.exhibits, ex.id, -1) }))}>↑</button>
                  <button className="btn small" aria-label={`Move exhibit ${n} later`} onClick={() => update((b) => ({ ...b, exhibits: moveExhibit(b.exhibits, ex.id, 1) }))}>↓</button>
                  <button className="btn small danger" aria-label={`Delete exhibit ${n}`} onClick={() => remove(ex.id)}>Delete</button>
                </div>
              </div>
              <div className="exhibit-meta" style={{ marginTop: 4 }}>
                {refs > 0 ? `Linked by ${refs} event${refs === 1 ? '' : 's'}` : 'Not linked by any event yet'} · SHA-256 <span className="hash">{shortHash(ex.sha256)}</span>
              </div>
              <div className="exhibit-desc">
                <div className="field" style={{ marginBottom: 6 }}>
                  <label htmlFor={`desc-${ex.id}`}>Source description — what is it and where did it come from?</label>
                  <input id={`desc-${ex.id}`} type="text" value={ex.description}
                    onChange={(e) => update((b) => ({ ...b, exhibits: b.exhibits.map((x) => (x.id === ex.id ? { ...x, description: e.target.value } : x)) }))}
                    placeholder="e.g. Photo of kitchen ceiling stain, taken by me" />
                </div>
                <div className="field" style={{ marginBottom: 0, maxWidth: 240 }}>
                  <label htmlFor={`cap-${ex.id}`}>Date evidence was made (optional)</label>
                  <input id={`cap-${ex.id}`} type="date" value={ex.capturedDate ?? ''}
                    onChange={(e) => update((b) => ({ ...b, exhibits: b.exhibits.map((x) => (x.id === ex.id ? { ...x, capturedDate: e.target.value || null } : x)) }))} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="step-nav">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={onNext}>Next: build timeline</button>
      </div>
    </section>
  );
}

function RentSafePanel({ update, caseAddress }: { update: Props['update']; caseAddress: string }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RentSafeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ackMismatch, setAckMismatch] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setAckMismatch(false);
    try {
      setResult(await searchBuildings(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function attach(rec: BuildingRecord) {
    const siteAddress = String(rec['SITE ADDRESS'] ?? '');
    const match = checkAddressMatch(caseAddress, siteAddress);
    if (!match.ok && !ackMismatch) return; // safety net; the button is disabled too
    const meta = {
      dataset: 'apartment-building-evaluation',
      query,
      fetchedAt: result?.fetchedAt ?? new Date().toISOString(),
      sourceUrl: result?.sourceUrl ?? DATASET_PAGE_URL,
      recordId: String(rec.RSN ?? rec._id ?? ''),
    };
    const payload = JSON.stringify({ meta, record: rec }, null, 1);
    const bytes = new TextEncoder().encode(payload);
    const ex: Exhibit = {
      id: uuid(),
      fileName: `rentsafeto-${(siteAddress || 'record').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
      kind: 'public-record',
      source: 'public-data',
      mimeType: 'application/json',
      byteSize: bytes.length,
      sha256: await sha256Hex(bytes),
      description: `RentSafeTO apartment building evaluation record fetched from Toronto Open Data for "${query}". Public data — verify against the City's dataset.${
        match.ok
          ? ''
          : ' Address check: SITE ADDRESS does not match this case\'s building address — attached for reference only, at the user\'s explicit acknowledgment.'
      }`,
      createdAt: new Date().toISOString(),
      capturedDate: rec['EVALUATION COMPLETED ON'] ? String(rec['EVALUATION COMPLETED ON']) : null,
      textContent: payload,
      publicRecord: meta,
    };
    await putFile(ex.id, new Blob([bytes], { type: 'application/json' }));
    update((b) => ({ ...b, exhibits: [...b.exhibits, ex] }));
  }

  return (
    <div className="card">
      <h3>Public data — RentSafeTO lookup <span className="chip public" style={{ marginLeft: 8 }}>optional</span></h3>
      <p className="sub">
        Look up the building's published City of Toronto{' '}
        <a href={DATASET_PAGE_URL} target="_blank" rel="noreferrer">RentSafeTO evaluation</a> and attach it as a labeled
        public-data exhibit. Only the street name you type is sent to Toronto's open-data API. Everything else works without it.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(); }}
          placeholder="Street name or address, e.g. 1325 York Mills"
          aria-label="Building address for RentSafeTO lookup"
          style={{ flex: 1, minWidth: 220, border: '1px solid var(--rule)', borderRadius: 8, padding: '9px 11px', font: 'inherit', fontSize: 14.5 }}
        />
        <button className="btn" onClick={() => void search()} disabled={busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search Toronto Open Data'}
        </button>
      </div>
      {error && <div className="banner warn" style={{ marginTop: 12 }}>Lookup failed: {error}. The rest of the app works offline.</div>}
      {result && (
        <>
          <p className="hint" style={{ marginTop: 10 }}>{result.total} record{result.total === 1 ? '' : 's'} matched (showing up to {result.records.length}).</p>
          {result.records.some((rec) => !checkAddressMatch(caseAddress, String(rec['SITE ADDRESS'] ?? '')).ok) && (
            <div className="banner warn" style={{ marginTop: 10 }}>
              Some results do not match this case's building address ({caseAddress || 'not set'}). Attaching an
              unrelated building's record would add unrelated evidence to the bundle.{' '}
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
                <input type="checkbox" checked={ackMismatch} onChange={(e) => setAckMismatch(e.target.checked)} />
                Attach mismatched records anyway — for reference only
              </label>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="results-table">
              <thead>
                <tr><th>Site address</th><th>Evaluated</th><th>Score</th><th></th></tr>
              </thead>
              <tbody>
                {result.records.map((rec, i) => {
                  const m = checkAddressMatch(caseAddress, String(rec['SITE ADDRESS'] ?? ''));
                  return (
                    <tr key={i}>
                      <td>
                        {String(rec['SITE ADDRESS'] ?? '—')}
                        {!m.ok && (
                          <div className="hint" style={{ color: 'var(--warn, #9a6a00)' }}>
                            {m.verifiable ? 'Does not match case address' : 'Cannot verify against case address'}
                          </div>
                        )}
                      </td>
                      <td>{String(rec['EVALUATION COMPLETED ON'] ?? '—')}</td>
                      <td>{String(rec['CURRENT BUILDING EVAL SCORE'] ?? '—')}</td>
                      <td>
                        <button
                          className="btn small"
                          disabled={!m.ok && !ackMismatch}
                          title={!m.ok && !ackMismatch ? 'Address mismatch — acknowledge above to attach for reference only' : undefined}
                          onClick={() => void attach(rec)}
                        >
                          {m.ok ? 'Attach as exhibit' : 'Attach anyway'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {result.records.length === 0 && <tr><td colSpan={4}>No matching buildings.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
