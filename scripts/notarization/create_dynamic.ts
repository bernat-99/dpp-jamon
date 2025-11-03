/**
 * CLI script to create a Dynamic notarization for the provided GS1 identifiers.
 * Run `npm run dpp:create -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID>`
 * after configuring IOTA and database variables in `.env`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextEncoder } from 'node:util';

import type { NotarizationSetup } from './common.js';
import {
  LOCKED_PENDING_VALUE,
  bootstrapNotarization,
  createPool,
  upsertDynamicLink,
} from './common.js';

const encoder = new TextEncoder();
const MANIFEST_FALLBACK = path.resolve('backend', 'src', 'manifest_seq1.json');

interface CliOptions {
  gtin?: string;
  lot?: string;
  serial?: string;
  cid?: string;
  seq?: number;
}

async function resolveManifestCid(): Promise<string> {
  try {
    const raw = await fs.readFile(MANIFEST_FALLBACK, 'utf8');
    const parsed = JSON.parse(raw) as { latest_cid?: string; cid?: string };
    if (parsed.latest_cid) {
      return parsed.latest_cid;
    }
    if (parsed.cid) {
      return parsed.cid;
    }
  } catch {
    // ignore
  }
  throw new Error(
    'Missing CID. Provide --cid, set MANIFEST_CID, or ensure backend/src/manifest_seq1.json contains latest_cid.',
  );
}

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
    if (value === undefined) {
      throw new Error(`Missing value for --${key}`);
    }
    switch (key) {
      case 'gtin':
        options.gtin = value;
        break;
      case 'lot':
        options.lot = value;
        break;
      case 'serial':
        options.serial = value;
        break;
      case 'cid':
        options.cid = value;
        break;
      case 'seq':
        options.seq = Number(value);
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
    i += 1;
  }
  return options;
}

function ensureIdentifiers(options: CliOptions): { gtin: string; lot: string; serial: string } {
  const gtin = options.gtin ?? process.env.DEFAULT_GTIN;
  const lot = options.lot ?? process.env.DEFAULT_LOT;
  const serial = options.serial ?? process.env.DEFAULT_SERIAL ?? '';
  if (!gtin || !lot) {
    throw new Error('GTIN and lot are required. Pass --gtin/--lot or set DEFAULT_GTIN/DEFAULT_LOT env vars.');
  }
  return { gtin, lot, serial };
}

async function resolveCid(options: CliOptions): Promise<string> {
  if (options.cid) {
    return options.cid;
  }
  if (process.env.MANIFEST_CID) {
    return process.env.MANIFEST_CID;
  }
  return resolveManifestCid();
}

function resolveSeq(options: CliOptions): number {
  if (options.seq && Number.isFinite(options.seq)) {
    return options.seq;
  }
  const envSeq = process.env.SEQ_DEFAULT ? Number(process.env.SEQ_DEFAULT) : Number.NaN;
  if (Number.isFinite(envSeq)) {
    return envSeq;
  }
  return 1;
}

function logSetup(prefix: string, setup: NotarizationSetup) {
  console.log(`${prefix} RPC: ${setup.rpcUrl}`);
  console.log(`${prefix} Address: ${setup.address}`);
  console.log(`${prefix} Package: ${setup.packageId}`);
}

async function main() {
  const options = parseArgs();
  const identifiers = ensureIdentifiers(options);
  const cid = await resolveCid(options);
  const seq = resolveSeq(options);
  const updatedAt = new Date().toISOString();

  const setup = await bootstrapNotarization();
  logSetup('[setup]', setup);

  const statePayload = {
    latest_cid: cid,
    seq,
    updated_at: updatedAt,
  };
  console.log('[state] bytes', JSON.stringify(statePayload));

  const metadataNote = process.env.NOTARIZATION_METADATA ?? 'dpp-jamon demo | env=testnet';
  const description = process.env.NOTARIZATION_DESCRIPTION ?? 'Pieza DPP - estado vivo';

  const execution = await setup.signerClient
    .createDynamic()
    .withBytesState(encoder.encode(JSON.stringify(statePayload)), 'Estado inicial Dynamic')
    .withImmutableDescription(description)
    .withUpdatableMetadata(`${metadataNote} | seq=${seq}`)
    .finish()
    .buildAndExecute(setup.signerClient);

  console.log('[tx] digest', execution.response.digest);
  console.log('[tx] status', execution.response.effects?.status);
  console.log('[tx] objectId', execution.output.id);

  const pool = createPool();
  try {
    const row = await upsertDynamicLink(pool, identifiers, execution.output.id);
    const lockedLabel = row.locked_id === LOCKED_PENDING_VALUE ? '(pending locked)' : row.locked_id;
    console.log(
      `[db] dpp_links updated for gtin=${row.gtin} lot=${row.lot} serial=${row.serial} -> dynamic=${row.dynamic_id} locked=${lockedLabel}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
