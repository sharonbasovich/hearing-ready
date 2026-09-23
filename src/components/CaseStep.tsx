import type { CaseBundle } from '../types';
import { ISSUE_TAGS } from '../types';

interface Props {
  bundle: CaseBundle;
  update: (fn: (b: CaseBundle) => CaseBundle) => void;
  onNext: () => void;
}

export default function CaseStep({ bundle, update, onNext }: Props) {
  const set = (patch: Partial<CaseBundle>) => update((b) => ({ ...b, ...patch }));
  const toggleTag = (tag: string) =>
    update((b) => ({
      ...b,
      issueTags: b.issueTags.includes(tag) ? b.issueTags.filter((t) => t !== tag) : [...b.issueTags, tag],
    }));

  return (
    <section className="card" aria-labelledby="case-h">
      <h2 id="case-h">Case details</h2>
      <p className="sub">These appear on the cover page of your PDF bundle. Everything is stored locally in this browser.</p>

      <div className="field">
        <label htmlFor="f-title">Bundle title</label>
        <input id="f-title" type="text" value={bundle.title}
          placeholder="e.g. Unit 3, 12 Oak St — maintenance evidence"
          onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="f-tenant">Tenant name(s) <span className="hint" style={{ display: 'inline' }}>(optional)</span></label>
        <input id="f-tenant" type="text" value={bundle.tenantName} onChange={(e) => set({ tenantName: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="f-addr">Rental unit address</label>
        <input id="f-addr" type="text" value={bundle.unitAddress}
          placeholder="Unit, street, city"
          onChange={(e) => set({ unitAddress: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="f-ll">Landlord / respondent <span className="hint" style={{ display: 'inline' }}>(optional)</span></label>
        <input id="f-ll" type="text" value={bundle.landlordName} onChange={(e) => set({ landlordName: e.target.value })} />
      </div>
      <div className="field">
        <label>This bundle is for</label>
        <div className="checks">
          {ISSUE_TAGS.map((tag) => (
            <label key={tag}>
              <input type="checkbox" checked={bundle.issueTags.includes(tag)} onChange={() => toggleTag(tag)} />
              {tag}
            </label>
          ))}
        </div>
        <p className="hint">T6 covers maintenance/repair applications; s.82 lets a tenant raise issues in an arrears proceeding. Confirm which applies on the LTB site.</p>
      </div>

      <div className="step-nav">
        <span />
        <button className="btn primary" onClick={onNext}>Next: add evidence</button>
      </div>
    </section>
  );
}
