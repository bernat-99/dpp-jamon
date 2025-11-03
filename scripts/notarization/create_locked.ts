/**
 * CLI script to mint a Locked notarization snapshot and store the ID in PostgreSQL.
 * Run `npm run dpp:lock -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID>` after
 * running the Dynamic creation script for the same GS1 identifiers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextEncoder } from 'node:util';

import { TimeLock } from '@iota/notarization/node';

import {
  bootstrapNotarization,
  createPool,
  ensureLinkExists,
  updateLockedLink,
} from './common.js';

const encoder = new TextEncoder();
const MANIFEST_FALLBACK = path.resolve('backend', 'src', 'manifest_seq1.json');

interface CliOptions {
  gtin?: string;
  lot?: string;
  serial?: string;
  cid?: string;
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
  throw new Error('Missing CID. Provide --cid, set MANIFEST_CID, or update backend/src/manifest_seq1.json.');
}

function parseArgs(): CliOptions {
  const options: CliOptions = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const value = args[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${token}`);
    }
    switch (token.slice(2)) {
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
      default:
        throw new Error(`Unknown option: ${token}`);
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
    throw new Error('GTIN and lot are required. Pass --gtin/--lot or set DEFAULT_GTIN/DEFAULT_LOT.');
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

async function main() {
  const options = parseArgs();
  const identifiers = ensureIdentifiers(options);
  const cid = await resolveCid(options);

  const pool = createPool();
  try {
    const link = await ensureLinkExists(pool, identifiers);
    if (!link.dynamic_id) {
      throw new Error('Dynamic notarization missing for provided identifiers.');
    }

    const setup = await bootstrapNotarization();
    console.log('[setup] rpc', setup.rpcUrl);
    console.log('[setup] package', setup.packageId);
    console.log('[setup] address', setup.address);

    const payload = {
      cid,
      created_at: new Date().toISOString(),
    };

    const execution = await setup.signerClient
      .createLocked()
      .withBytesState(encoder.encode(JSON.stringify(payload)))
      .withImmutableDescription('DPP snapshot (locked)')
      .withDeleteLock(TimeLock.withNone())
      .finish()
      .buildAndExecute(setup.signerClient);

    console.log('[tx] digest', execution.response.digest);
    console.log('[tx] status', execution.response.effects?.status);
    console.log('[tx] locked_id', execution.output.id);

    const row = await updateLockedLink(pool, identifiers, execution.output.id);
    console.log(
      `[db] dpp_links updated for gtin=${row.gtin} lot=${row.lot} serial=${row.serial} -> locked=${row.locked_id}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
