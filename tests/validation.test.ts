import { describe, expect, it } from 'vitest';
import { validateBundle } from '../src/lib/validation';
import { makeBundle, makeEvent, makeExhibit } from './fixtures';

describe('validateBundle', () => {
  it('flags an empty bundle', () => {
    const issues = validateBundle(makeBundle({ title: '', unitAddress: '' }));
    const messages = issues.map((i) => i.message).join('\n');
    expect(messages).toContain('no title');
    expect(messages).toContain('address is missing');
    expect(messages).toContain('Timeline is empty');
    expect(messages).toContain('No exhibits');
  });

  it('flags events with missing or invalid dates', () => {
    const ev1 = makeEvent({ date: null, title: 'Undated' });
    const ev2 = makeEvent({ date: 'not-a-date', title: 'Bad date' });
    const issues = validateBundle(makeBundle({ events: [ev1, ev2] }));
    expect(issues.filter((i) => i.target.kind === 'event' && i.message.includes('usable date')).length).toBe(2);
  });

  it('notes events with no linked exhibits and unreferenced exhibits', () => {
    const ex = makeExhibit();
    const ev = makeEvent({ exhibitIds: [] });
    const issues = validateBundle(makeBundle({ events: [ev], exhibits: [ex] }));
    expect(issues.some((i) => i.message.includes('links no exhibits'))).toBe(true);
    expect(issues.some((i) => i.message.includes('not linked by any timeline event'))).toBe(true);
  });

  it('flags exhibits without a source description', () => {
    const ex = makeExhibit({ description: '  ' });
    const ev = makeEvent({ exhibitIds: [ex.id] });
    const issues = validateBundle(makeBundle({ events: [ev], exhibits: [ex] }));
    expect(issues.some((i) => i.message.includes('no source description'))).toBe(true);
  });

  it('flags stale exhibit references', () => {
    const ev = makeEvent({ exhibitIds: ['ghost-id'] });
    const issues = validateBundle(makeBundle({ events: [ev] }));
    expect(issues.some((i) => i.message.includes('no longer exist'))).toBe(true);
  });

  it('passes a complete bundle with no warnings', () => {
    const ex = makeExhibit();
    const ev = makeEvent({ exhibitIds: [ex.id] });
    const issues = validateBundle(makeBundle({ events: [ev], exhibits: [ex] }));
    expect(issues.filter((i) => i.severity === 'warning')).toHaveLength(0);
  });
});
