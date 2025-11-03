/**
 * Generate a minimal EPCIS 2.0 ObjectEvent in JSON-LD and persist it under samples/epcis/.
 * Run `npm run epcis:gen -- --gtin <GTIN> --serial <SERIAL> --lot <LOT>` to emit a new sample.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

interface CliOptions {
  gtin?: string;
  serial?: string;
  lot?: string;
  gln?: string;
}

interface EpciEvent {
  '@context': string[];
  type: 'ObjectEvent';
  action: string;
  bizStep: string;
  disposition: string;
  eventTime: string;
  eventTimeZoneOffset: string;
  readPoint: { id: string };
  epcList: string[];
  ilmd: Record<string, unknown>;
  [key: string]: unknown;
}

const OUTPUT_DIR = path.resolve('samples', 'epcis');

function parseArgs(): CliOptions {
  const options: CliOptions = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = args[i + 1];
    if (!value) {
      throw new Error(`Missing value for --${key}`);
    }
    switch (key) {
      case 'gtin':
        options.gtin = value;
        break;
      case 'serial':
        options.serial = value;
        break;
      case 'lot':
        options.lot = value;
        break;
      case 'gln':
        options.gln = value;
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
    i += 1;
  }
  return options;
}

function padCompany(company: string): string {
  return company.padEnd(7, '0');
}

function formatSgtin(gtin: string, serial: string): string {
  if (gtin.length !== 14) {
    throw new Error('GTIN must contain 14 digits to build an SGTIN.');
  }
  const company = gtin.slice(1, 8);
  const item = gtin.slice(8);
  return `urn:epc:id:sgtin:${padCompany(company)}.${item}.${serial}`;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function nextFilename(): Promise<string> {
  await ensureOutputDir();
  const files = await fs.readdir(OUTPUT_DIR);
  const prefix = 'event-';
  const suffix = '.json';
  let maxIndex = 0;
  for (const file of files) {
    if (file.startsWith(prefix) && file.endsWith(suffix)) {
      const numericPart = file.slice(prefix.length, file.length - suffix.length);
      const parsed = Number.parseInt(numericPart, 10);
      if (!Number.isNaN(parsed)) {
        maxIndex = Math.max(maxIndex, parsed);
      }
    }
  }
  const nextIndex = maxIndex + 1;
  return path.join(OUTPUT_DIR, `${prefix}${String(nextIndex).padStart(3, '0')}${suffix}`);
}

function buildEvent(options: CliOptions): EpciEvent {
  const gtin = options.gtin ?? process.env.DEFAULT_GTIN ?? '01234567890128';
  const serial = options.serial ?? process.env.DEFAULT_SERIAL ?? '123456';
  const lot = options.lot ?? process.env.DEFAULT_LOT ?? 'L-SECADERO-2025-10-31';
  const gln = options.gln ?? process.env.DEFAULT_GLN ?? '8437000123456';

  return {
    '@context': ['https://ref.gs1.org/epcis'],
    type: 'ObjectEvent',
    action: 'OBSERVE',
    bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
    disposition: 'urn:epcglobal:cbv:disp:in_progress',
    eventTime: new Date().toISOString(),
    eventTimeZoneOffset: '+00:00',
    readPoint: {
      id: `urn:epc:id:sgln:${gln}.0000`,
    },
    epcList: [formatSgtin(gtin, serial)],
    ilmd: {
      'https://gs1.org/voc/batchNumber': lot,
      'https://gs1.org/voc/productOwner': `urn:epc:id:pgln:${gln}`,
    },
    extensions: {
      'https://dpp-jamon.example/lotState': {
        humidityPct: 72.1,
        temperatureC: 18.6,
      },
    },
  };
}

async function main() {
  const options = parseArgs();
  const event = buildEvent(options);
  const filePath = await nextFilename();
  await fs.writeFile(filePath, JSON.stringify(event, null, 2));
  console.log('[epcis] file', filePath);
  console.log(JSON.stringify(event, null, 2));
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
