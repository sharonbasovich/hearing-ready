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

// Suffix words users type inconsistently ("road" vs "RD") — never required.
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

// Street-type words stay soft, but directions are significant:
// '55 BLOOR ST E' and '55 BLOOR ST W' are different buildings. Single-letter
// directions are normalized to the spelled-out form before comparing, so
// 'Bloor St E' and 'Bloor St East' behave identically.
const ADDR_SOFT = new Set([...SOFT_TOKENS].filter((t) => !['EAST', 'WEST', 'NORTH', 'SOUTH'].includes(t)));

const DIR_ABBR: Record<string, string> = { E: 'EAST', W: 'WEST', N: 'NORTH', S: 'SOUTH' };

/** Normalizes one uppercase address token (single-letter directions → full words). */
const normTok = (t: string): string => DIR_ABBR[t] ?? t;

/** Significant address tokens: soft suffixes dropped, but every digit token kept
 *  (a one-digit street number like "9" is still required — prevents 9 vs 19 matches). */
const significant = (t: string): boolean => !ADDR_SOFT.has(t) && (t.length >= 2 || /\d/.test(t));

const UNIT_WORDS =
  /\b(UNIT|SUITE|STE|APT|APARTMENT|BSMT|BASEMENT|ROOM|RM|FL|FLOOR|PH|PENTHOUSE|TH|#)\s*[\dA-Z-]*/g;

/**
 * Reduces a tenant-entered unit address to street-level tokens: strips
 * unit/suite designators, keeps the first comma segment that has both a
 * number and a street-name word, and drops soft suffix/direction words.
 */
function buildingTokens(address: string): string[] {
  const cleaned = address.toUpperCase().replace(/#/g, ' UNIT ').replace(UNIT_WORDS, ' ');
  const segs = cleaned
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hasName = (s: string) =>
    s.split(/\s+/).some((t) => t.length >= 2 && !SOFT_TOKENS.has(t) && !/^\d+$/.test(t));
  const seg =
    segs.find((s) => /\d/.test(s) && hasName(s)) ?? segs.find((s) => /\d/.test(s)) ?? segs[0] ?? '';
  return seg
    .split(/[\s/-]+/)
    .map((t) => normTok(t.replace(/[^A-Z0-9]/g, '')))
    .filter(significant);
}

export interface AddressMatch {
  /** true when every case street token appears in the record's SITE ADDRESS. */
  ok: boolean;
  /** false when the case address (or site address) yields nothing to compare. */
  verifiable: boolean;
  /** Street-level tokens derived from the case address, for display/debugging. */
  requiredTokens: string[];
}

/**
 * Guards against attaching a RentSafeTO record for a different building.
 * Every street-level token of the case address (e.g. the street number and
 * street name) must appear as a whole token in SITE ADDRESS.
 */
export function checkAddressMatch(caseAddress: string, siteAddress: string): AddressMatch {
  const required = buildingTokens(caseAddress);
  const site = new Set(
    siteAddress
      .toUpperCase()
      .split(/[\s/-]+/)
      .map((t) => normTok(t.replace(/[^A-Z0-9]/g, '')))
      .filter(significant),
  );
  const verifiable = required.length > 0 && site.size > 0;
  return { ok: verifiable && required.every((t) => site.has(t)), verifiable, requiredTokens: required };
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
  // A few maintenance-relevant subscores published by the dataset.
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
