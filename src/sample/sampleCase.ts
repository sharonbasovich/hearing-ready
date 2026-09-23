import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CaseBundle, Exhibit, TimelineEvent } from '../types';
import { sha256Hex, uuid } from '../lib/bytes';
import { publicRecordText } from '../rentsafe';
import type { BuildingRecord } from '../rentsafe';

/**
 * Fully synthetic sample case for demos. Names, addresses and records are fictional.
 * Images are generated on a canvas at load time — no real photos are used.
 */

export interface SampleData {
  bundle: CaseBundle;
  files: Map<string, Uint8Array>;
}

function makeExhibit(partial: Partial<Exhibit> & Pick<Exhibit, 'fileName' | 'kind' | 'source'>): Exhibit {
  return {
    id: uuid(),
    mimeType: 'application/octet-stream',
    byteSize: 0,
    sha256: null,
    description: '',
    createdAt: new Date().toISOString(),
    capturedDate: null,
    ...partial,
  };
}

async function drawSamplePhoto(title: string, subtitle: string, hue: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 560;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 560);
  grad.addColorStop(0, `hsl(${hue}, 28%, 78%)`);
  grad.addColorStop(1, `hsl(${hue}, 30%, 58%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 800, 560);
  // a stylized "stain" blob
  g.fillStyle = `hsla(${hue + 20}, 45%, 35%, 0.55)`;
  g.beginPath();
  g.ellipse(400, 250, 190, 120, 0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(430, 300, 90, 60, -0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(24, 470, 752, 66);
  g.fillStyle = '#1a2e4a';
  g.font = 'bold 26px sans-serif';
  g.fillText(title, 40, 500);
  g.font = '16px sans-serif';
  g.fillText(subtitle, 40, 524);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

async function makeLetterPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawText('SAMPLE — SYNTHETIC LETTER (demo data only)', { x: 54, y: 740, size: 10, font: bold, color: rgb(0.6, 0.2, 0.1) });
  page.drawText('To: Example Property Management (fictional)', { x: 54, y: 700, size: 12, font });
  page.drawText('From: Alex Morgan (sample tenant), Unit 3, 999 Fictional Ave', { x: 54, y: 682, size: 12, font });
  page.drawText('Date: 14 January 2026', { x: 54, y: 664, size: 12, font });
  const body = [
    'This is a synthetic maintenance request used only to demonstrate',
    'Hearing-Ready. It describes a fictional ceiling leak reported on',
    '12 January 2026 and asks for repair within a reasonable time.',
    'No real person, address, or property is involved.',
  ];
  body.forEach((line, i) => page.drawText(line, { x: 54, y: 620 - i * 16, size: 11, font }));
  return doc.save();
}

function messagesText(): string {
  return [
    'SAMPLE TEXT MESSAGE EXPORT — synthetic demo data',
    'Exported 2 February 2026',
    '',
    '[12 Jan 2026, 09:14] Me: There is water coming through the kitchen ceiling. Sending photos now.',
    '[12 Jan 2026, 10:02] Building manager: Thanks, we will send someone to look.',
    '[19 Jan 2026, 16:40] Me: Still leaking when it rains. The stain is larger.',
    '[26 Jan 2026, 08:55] Me: Mould smell in the kitchen now. Please confirm a repair date.',
    '[26 Jan 2026, 12:31] Building manager: Contractor scheduled next week.',
    '[02 Feb 2026, 09:05] Me: No one has come yet. Please update.',
  ].join('\n');
}

const SAMPLE_RENTSAFE_RECORD: BuildingRecord = {
  RSN: '0000000',
  'YEAR BUILT': 1972,
  'YEAR EVALUATED': 2024,
  'PROPERTY TYPE': 'PRIVATE (SAMPLE)',
  'WARD': '00',
  WARDNAME: 'Sample Ward',
  'SITE ADDRESS': '999 FICTIONAL AVE',
  'CONFIRMED STOREYS': '12',
  'CONFIRMED UNITS': '84',
  'EVALUATION COMPLETED ON': '2024-11-05',
  'CURRENT BUILDING EVAL SCORE': '81',
  'PROACTIVE BUILDING SCORE': '81',
  'CURRENT REACTIVE SCORE': '0',
  'NO OF AREAS EVALUATED': 44,
  'COMMON AREA PESTS': '2',
  'BUILDING CLEANLINESS': '3',
  'ELEVATOR MAINTENANCE': '3',
};

export async function buildSampleData(): Promise<SampleData> {
  const files = new Map<string, Uint8Array>();

  const photo1 = await drawSamplePhoto('Photo 1 — kitchen ceiling stain', 'Synthetic demo image · 12 Jan 2026', 205);
  const photo2 = await drawSamplePhoto('Photo 2 — mould at window frame', 'Synthetic demo image · 26 Jan 2026', 95);
  const photo3 = await drawSamplePhoto('Photo 3 — baseboard heater gap', 'Synthetic demo image · 9 Feb 2026', 20);
  const letter = await makeLetterPdf();
  const messages = new TextEncoder().encode(messagesText());

  const rentsafeMeta = {
    dataset: 'apartment-building-evaluation',
    query: 'FICTIONAL AVE (synthetic sample)',
    fetchedAt: new Date().toISOString(),
    sourceUrl: 'https://open.toronto.ca/dataset/apartment-building-evaluation/',
    recordId: 'sample',
    synthetic: true,
  };

  const exhibits: Exhibit[] = [
    makeExhibit({
      fileName: 'ceiling-stain-12jan.png',
      kind: 'photo',
      source: 'tenant-upload',
      mimeType: 'image/png',
      byteSize: photo1.length,
      sha256: await sha256Hex(photo1),
      description: 'Sample photo of a brown water stain spreading across the kitchen ceiling, taken by the tenant.',
      capturedDate: '2026-01-12',
    }),
    makeExhibit({
      fileName: 'mould-window-26jan.png',
      kind: 'photo',
      source: 'tenant-upload',
      mimeType: 'image/png',
      byteSize: photo2.length,
      sha256: await sha256Hex(photo2),
      description: 'Sample photo showing dark mould spots at the kitchen window frame.',
      capturedDate: '2026-01-26',
    }),
    makeExhibit({
      fileName: 'letter-to-landlord.pdf',
      kind: 'pdf',
      source: 'tenant-upload',
      mimeType: 'application/pdf',
      byteSize: letter.length,
      sha256: await sha256Hex(letter),
      description: 'Sample letter sent to the property manager reporting the ceiling leak and requesting repair.',
      capturedDate: '2026-01-14',
    }),
    makeExhibit({
      fileName: 'messages-jan-feb.txt',
      kind: 'text',
      source: 'tenant-upload',
      mimeType: 'text/plain',
      byteSize: messages.length,
      sha256: await sha256Hex(messages),
      description: 'Sample text-message export between the tenant and the building manager about the leak and repairs.',
      capturedDate: '2026-02-02',
      textContent: messagesText(),
    }),
    makeExhibit({
      fileName: 'heater-gap-9feb.png',
      kind: 'photo',
      source: 'tenant-upload',
      mimeType: 'image/png',
      byteSize: photo3.length,
      sha256: await sha256Hex(photo3),
      description: 'Sample photo of a gap beside the baseboard heater where cold air enters.',
      capturedDate: '2026-02-09',
    }),
    makeExhibit({
      fileName: 'rentsafeto-evaluation-sample.json',
      kind: 'public-record',
      source: 'public-data',
      mimeType: 'application/json',
      description: 'SYNTHETIC SAMPLE — fictional data, not an actual City of Toronto record; format inspired by RentSafeTO. All scores and fields are invented demo values.',
      publicRecord: rentsafeMeta,
      textContent: JSON.stringify({ meta: rentsafeMeta, record: SAMPLE_RENTSAFE_RECORD }, null, 1),
    }),
  ];
  exhibits[5].byteSize = new TextEncoder().encode(exhibits[5].textContent!).length;
  exhibits[5].sha256 = await sha256Hex(new TextEncoder().encode(exhibits[5].textContent!));

  const events: TimelineEvent[] = [
    {
      id: uuid(),
      date: '2026-01-12',
      precision: 'day',
      title: 'Water begins leaking through kitchen ceiling',
      details: 'Water came through the kitchen ceiling during rain. I photographed the stain and messaged the building manager the same morning.',
      exhibitIds: [exhibits[0].id, exhibits[3].id],
    },
    {
      id: uuid(),
      date: '2026-01-14',
      precision: 'day',
      title: 'Written repair request sent',
      details: 'I sent a letter to the property manager describing the leak and asking for repair within a reasonable time.',
      exhibitIds: [exhibits[2].id],
    },
    {
      id: uuid(),
      date: '2026-01-26',
      precision: 'day',
      title: 'Mould appears at kitchen window',
      details: 'Dark spots appeared at the window frame and there was a mould smell. I messaged the manager again.',
      exhibitIds: [exhibits[1].id, exhibits[3].id],
    },
    {
      id: uuid(),
      date: '2026-02',
      precision: 'month',
      title: 'Synthetic public-data sample added',
      details: 'A synthetic sample record in the format of a City of Toronto RentSafeTO evaluation was added to demonstrate the public-data exhibit type. All values are invented — no live lookup was performed.',
      exhibitIds: [exhibits[5].id],
    },
    {
      id: uuid(),
      date: '2026-02-09',
      precision: 'day',
      title: 'Cold air entering beside baseboard heater',
      details: 'I found a gap beside the baseboard heater letting in cold air and photographed it.',
      exhibitIds: [exhibits[4].id],
    },
    {
      id: uuid(),
      date: null,
      precision: 'day',
      title: 'Draft — confirm repair visit date',
      details: 'The manager said a contractor would come "next week" but no confirmed date is recorded yet. Fill in the date once confirmed.',
      exhibitIds: [exhibits[3].id],
    },
  ];

  const bundle: CaseBundle = {
    id: 'current',
    title: 'Unit 3, 999 Fictional Ave — maintenance evidence (SAMPLE)',
    tenantName: 'Alex Morgan (sample tenant)',
    unitAddress: 'Unit 3, 999 Fictional Ave, Toronto ON (fictional)',
    landlordName: 'Example Property Management (fictional)',
    issueTags: ['T6 – maintenance application'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events,
    exhibits,
  };

  files.set(exhibits[0].id, photo1);
  files.set(exhibits[1].id, photo2);
  files.set(exhibits[2].id, letter);
  files.set(exhibits[3].id, messages);
  files.set(exhibits[4].id, photo3);
  files.set(exhibits[5].id, new TextEncoder().encode(exhibits[5].textContent!));

  return { bundle, files };
}

export { publicRecordText };
