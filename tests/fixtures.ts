import type { CaseBundle, Exhibit, TimelineEvent } from '../src/types';

/** 1x1 transparent PNG. */
export const TINY_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);

let counter = 0;
const nid = () => `t${++counter}`;

export function makeExhibit(partial: Partial<Exhibit> = {}): Exhibit {
  const id = partial.id ?? nid();
  return {
    id,
    fileName: `${id}.png`,
    kind: 'photo',
    source: 'tenant-upload',
    mimeType: 'image/png',
    byteSize: TINY_PNG.length,
    sha256: 'a'.repeat(64),
    description: `Description for ${id}`,
    createdAt: '2026-09-20T12:00:00.000Z',
    capturedDate: '2026-01-10',
    ...partial,
  };
}

export function makeEvent(partial: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: nid(),
    date: '2026-01-12',
    precision: 'day',
    title: 'Something happened',
    details: 'A factual sentence about what happened.',
    exhibitIds: [],
    ...partial,
  };
}

export function makeBundle(overrides: Partial<CaseBundle> = {}): CaseBundle {
  return {
    id: 'test',
    title: 'Test bundle',
    tenantName: 'Sample Tenant',
    unitAddress: 'Unit 1, 1 Example St',
    landlordName: 'Sample Landlord',
    issueTags: ['T6 – maintenance application'],
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    events: [],
    exhibits: [],
    ...overrides,
  };
}
