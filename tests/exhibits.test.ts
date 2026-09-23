import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  exhibitNumber,
  moveExhibit,
  removeExhibit,
  referencedExhibitIds,
} from '../src/lib/exhibits';
import { makeBundle, makeEvent, makeExhibit } from './fixtures';

describe('exhibit numbering', () => {
  it('numbers exhibits positionally starting at 1', () => {
    const a = makeExhibit();
    const b = makeExhibit();
    const c = makeExhibit();
    const bundle = makeBundle({ exhibits: [a, b, c] });
    expect(exhibitNumber(bundle, a.id)).toBe(1);
    expect(exhibitNumber(bundle, b.id)).toBe(2);
    expect(exhibitNumber(bundle, c.id)).toBe(3);
  });

  it('returns null for unknown exhibits', () => {
    expect(exhibitNumber(makeBundle(), 'nope')).toBeNull();
  });

  it('renumbers after reordering', () => {
    const a = makeExhibit();
    const b = makeExhibit();
    const c = makeExhibit();
    const exhibits = moveExhibit([a, b, c], c.id, -1);
    const bundle = makeBundle({ exhibits });
    expect(exhibitNumber(bundle, c.id)).toBe(2);
    expect(exhibitNumber(bundle, b.id)).toBe(3);
  });

  it('renumbers after deletion and strips event links', () => {
    const a = makeExhibit();
    const b = makeExhibit();
    const ev = makeEvent({ exhibitIds: [a.id, b.id] });
    const bundle = makeBundle({ exhibits: [a, b], events: [ev] });
    const next = removeExhibit(bundle, a.id);
    expect(exhibitNumber(next, b.id)).toBe(1);
    expect(next.events[0].exhibitIds).toEqual([b.id]);
  });

  it('moveExhibit is a no-op at the boundaries', () => {
    const a = makeExhibit();
    const b = makeExhibit();
    expect(moveExhibit([a, b], a.id, -1).map((e) => e.id)).toEqual([a.id, b.id]);
    expect(moveExhibit([a, b], b.id, 1).map((e) => e.id)).toEqual([a.id, b.id]);
  });
});

describe('referencedExhibitIds', () => {
  it('collects only exhibits linked from events', () => {
    const a = makeExhibit();
    const b = makeExhibit();
    const ev = makeEvent({ exhibitIds: [a.id] });
    const refs = referencedExhibitIds(makeBundle({ exhibits: [a, b], events: [ev] }));
    expect(refs.has(a.id)).toBe(true);
    expect(refs.has(b.id)).toBe(false);
  });
});

describe('classifyFile', () => {
  it('classifies by mime and extension', () => {
    expect(classifyFile('x.jpg', 'image/jpeg')).toBe('photo');
    expect(classifyFile('x.png', 'image/png')).toBe('photo');
    expect(classifyFile('x.pdf', 'application/pdf')).toBe('pdf');
    expect(classifyFile('x.PDF', '')).toBe('pdf');
    expect(classifyFile('x.txt', 'text/plain')).toBe('text');
    expect(classifyFile('x.bin', 'application/octet-stream')).toBe('text');
  });
});
