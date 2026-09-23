export type ExhibitKind = 'photo' | 'pdf' | 'text' | 'note' | 'public-record';

export type ExhibitSource = 'tenant-upload' | 'tenant-note' | 'public-data';

export interface PublicRecordMeta {
  dataset: string;
  query: string;
  fetchedAt: string; // ISO timestamp
  sourceUrl: string;
  recordId?: string;
  /** true when the record is invented demo data, not a live API result. */
  synthetic?: boolean;
}

export interface Exhibit {
  id: string;
  fileName: string;
  kind: ExhibitKind;
  source: ExhibitSource;
  mimeType: string;
  byteSize: number;
  /** SHA-256 of the exact bytes. Identifies the file's contents; it does not prove authenticity. */
  sha256: string | null;
  description: string;
  createdAt: string; // ISO
  capturedDate: string | null; // YYYY-MM-DD the evidence was captured, if known
  textContent?: string; // notes / text messages / public-record summaries
  publicRecord?: PublicRecordMeta;
}

export type DatePrecision = 'day' | 'month';

export interface TimelineEvent {
  id: string;
  /** 'YYYY-MM-DD' for day precision, 'YYYY-MM' for month precision, null when unknown. */
  date: string | null;
  precision: DatePrecision;
  title: string;
  details: string; // plain-language factual sentences
  exhibitIds: string[];
}

export interface CaseBundle {
  id: string;
  title: string;
  tenantName: string;
  unitAddress: string;
  landlordName: string;
  issueTags: string[];
  createdAt: string;
  updatedAt: string;
  events: TimelineEvent[];
  /** Order in this array is the exhibit numbering (index + 1). */
  exhibits: Exhibit[];
}

export const ISSUE_TAGS = [
  'T6 – maintenance application',
  's.82 – issues raised in arrears proceeding',
] as const;

export function emptyCase(): CaseBundle {
  const now = new Date().toISOString();
  return {
    id: 'current',
    title: '',
    tenantName: '',
    unitAddress: '',
    landlordName: '',
    issueTags: ['T6 – maintenance application'],
    createdAt: now,
    updatedAt: now,
    events: [],
    exhibits: [],
  };
}
