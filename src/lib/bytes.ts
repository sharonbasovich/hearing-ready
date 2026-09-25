/** SHA-256 hex of the exact bytes. Identifies a file's contents — it does NOT prove authenticity. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function shortHash(hex: string | null): string {
  return hex ? `${hex.slice(0, 12)}…` : '—';
}

export function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 48) return slug || 'bundle';
  return slug.slice(0, 48).replace(/-[^-]*$/, '') || 'bundle';
}

export function uuid(): string {
  return crypto.randomUUID();
}
