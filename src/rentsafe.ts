/**
 * Toronto Open Data (CKAN) client for the RentSafeTO Apartment Building Evaluation dataset.
 * Public API, no key required. The app works fully offline without this feature.
 * Dataset: https://open.toronto.ca/dataset/apartment-building-evaluation/
 */

const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action';
export const DATASET_ID = 'apartment-building-evaluation';
export const DATASTORE_RESOURCE_ID = '244f7a02-da5c-425b-b55f-fbdd133dd732'; // 2023–current evaluations
export const DATASET_PAGE_URL = 'https://open.toronto.ca/dataset/apartment-building-evaluation/';

export interface BuildingRecord {
  [field: string]: string | number | null | undefined;
}

export interface RentSafeResult {
  records: BuildingRecord[];
  total: number;
  query: string;
  sourceUrl: string;
  fetchedAt: string;
}

// Suffix/direction words users type inconsistently ("road" vs "RD") — never required.
const SOFT_TOKENS = new Set([
  'RD', 'ROAD', 'ST', 'STREET', 'AVE', 'AVENUE', 'BLVD', 'BOULEVARD', 'DR', 'DRIVE',
  'CRES', 'CRESCENT', 'CT', 'COURT', 'LN', 'LANE', 'PL', 'PLACE', 'PKWY', 'PARKWAY',
  'TERR', 'TERRACE', 'WAY', 'CIR', 'CIRCLE', 'E', 'W', 'N', 'S', 'EAST', 'WEST', 'NORTH', 'SOUTH',
]);

/** Tokens that must appear in SITE ADDRESS for a record to be a plausible match. */
function matchTokens(query: string): string[] {
  return query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !SOFT_TOKENS.has(t));
}

export function datastoreSearchUrl(query: string, limit = 10): string {
  const params = new URLSearchParams({
    resource_id: DATASTORE_RESOURCE_ID,
    q: query.trim(),
    limit: String(limit),
  });
  return `${CKAN_BASE}/datastore_search?${params.toString()}`;
}

let jsonpSeq = 0;

/**
 * CKAN serves JSONP via ?callback= — used because the API does not send CORS
 * headers, so a plain fetch() is blocked in browsers.
 */
export function searchBuildings(query: string): Promise<RentSafeResult> {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  // CKAN's full-text q is unreliable for multi-word addresses; numeric tokens
  // (street numbers) match most precisely, so prefer them server-side.
  const digitTokens = tokens.filter((t) => /\d/.test(t));
  const serverQuery = (digitTokens.length ? digitTokens : tokens).join(' ') || query.trim();
  const base = datastoreSearchUrl(serverQuery, 25);
  return new Promise((resolve, reject) => {
    const cb = `__hearingReadyRentsafe${++jsonpSeq}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    const cleanup = () => {
      delete w[cb];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Toronto Open Data request timed out'));
    }, 15_000);
    w[cb] = (json: { success?: boolean; result?: { records?: BuildingRecord[]; total?: number } }) => {
      cleanup();
      if (!json?.success || !json.result) {
        reject(new Error('Toronto Open Data returned an error'));
        return;
      }
      const raw = json.result.records ?? [];
      const required = matchTokens(query);
      const filtered = required.length
        ? raw.filter((r) => {
            const addr = String(r['SITE ADDRESS'] ?? '').toUpperCase();
            return required.every((t) => addr.includes(t));
          })
        : raw;
      resolve({
        records: filtered.length || !required.length ? filtered : raw,
        total: json.result.total ?? 0,
        query,
        sourceUrl: base,
        fetchedAt: new Date().toISOString(),
      });
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Toronto Open Data request failed'));
    };
    script.src = `${base}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

/** Human-readable summary of a RentSafeTO evaluation record, used in the exhibit page. */
export function summarizeRecord(rec: BuildingRecord): { label: string; value: string }[] {
  const pick = (...keys: string[]) =>
    keys.map((k) => rec[k]).find((v) => v !== undefined && v !== null && v !== '');
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') rows.push({ label, value: String(v) });
  };
  add('Site address', pick('SITE ADDRESS'));
  add('Property type', pick('PROPERTY TYPE'));
  add('Ward', [rec['WARD'], rec['WARDNAME']].filter(Boolean).join(' — '));
  add('Year built', pick('YEAR BUILT'));
  add('Year registered', pick('YEAR REGISTERED'));
  add('Confirmed storeys / units', [rec['CONFIRMED STOREYS'], rec['CONFIRMED UNITS']].filter(Boolean).join(' / '));
  add('Evaluation completed on', pick('EVALUATION COMPLETED ON'));
  add('Current building evaluation score', pick('CURRENT BUILDING EVAL SCORE'));
  add('Proactive building score', pick('PROACTIVE BUILDING SCORE'));
  add('Current reactive score', pick('CURRENT REACTIVE SCORE'));
  add('Areas evaluated', pick('NO OF AREAS EVALUATED'));
  // A few maintenance-relevant subscores; RentSafeTO scores these 1–5 (5 best).
  const subKeys = [
    'COMMON AREA PESTS',
    'BUILDING CLEANLINESS',
    'ELEVATOR MAINTENANCE',
    'STAIRWELL - WALLS AND CEILING',
    'INT. HALLWAY - WALLS / CEILING',
    'COMMON AREA VENTILATION',
    'EXTERIOR DOORS',
    'WINDOWS',
  ];
  for (const k of subKeys) add(`Subscore: ${k.toLowerCase()}`, rec[k]);
  return rows;
}

export function publicRecordText(meta: { query: string; fetchedAt: string; sourceUrl: string }, rec: BuildingRecord): string {
  const lines = summarizeRecord(rec).map((r) => `${r.label}: ${r.value}`);
  return [
    'RentSafeTO Apartment Building Evaluation — City of Toronto Open Data',
    `Query: "${meta.query}"`,
    `Fetched: ${meta.fetchedAt}`,
    `Source: ${meta.sourceUrl}`,
    `Dataset page: ${DATASET_PAGE_URL}`,
    '',
    ...lines,
  ].join('\n');
}
