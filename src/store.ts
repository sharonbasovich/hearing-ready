import Dexie, { type Table } from 'dexie';
import type { CaseBundle } from './types';

interface BlobRow {
  id: string; // exhibit id
  data: Blob;
}

class HearingReadyDB extends Dexie {
  cases!: Table<CaseBundle, string>;
  blobs!: Table<BlobRow, string>;

  constructor() {
    super('hearing-ready');
    this.version(1).stores({ cases: 'id', blobs: 'id' });
  }
}

export const db = new HearingReadyDB();

export async function saveBundle(bundle: CaseBundle): Promise<void> {
  await db.cases.put({ ...bundle, updatedAt: new Date().toISOString() });
}

export async function loadBundle(id = 'current'): Promise<CaseBundle | undefined> {
  return db.cases.get(id);
}

export async function putFile(exhibitId: string, data: Blob): Promise<void> {
  await db.blobs.put({ id: exhibitId, data });
}

export async function deleteFile(exhibitId: string): Promise<void> {
  await db.blobs.delete(exhibitId);
}

export async function getFileBytes(exhibitId: string): Promise<Uint8Array | null> {
  const row = await db.blobs.get(exhibitId);
  if (!row) return null;
  return new Uint8Array(await row.data.arrayBuffer());
}

export async function getFileBlob(exhibitId: string): Promise<Blob | null> {
  const row = await db.blobs.get(exhibitId);
  return row?.data ?? null;
}

/** Collect every exhibit's bytes for export; exhibits without stored bytes (notes) are skipped. */
export async function collectFiles(exhibitIds: string[]): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();
  await Promise.all(
    exhibitIds.map(async (id) => {
      const bytes = await getFileBytes(id);
      if (bytes) map.set(id, bytes);
    }),
  );
  return map;
}
