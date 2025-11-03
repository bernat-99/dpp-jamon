/**
 * CLI script to push a new state version to an existing Dynamic notarization.
 * Run `npm run dpp:update -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID> [--seq <N>]`.
 * The script resolves the notarization ID from PostgreSQL and publishes the updated state on IOTA.
 */
import { TextDecoder, TextEncoder } from 'node:util';

import { State } from '@iota/notarization/node';

import {
  bootstrapNotarization,
  createPool,
  ensureLinkExists,
} from './common.js';

const encoder = new TextEncoder();

interface CliOptions {
  gtin?: string;
  lot?: string;
  serial?: string;
  cid?: string;
  seq?: number;
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
      case 'seq':
        options.seq = Number(value);
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

function resolveCid(options: CliOptions): string {
  const value = options.cid ?? process.env.MANIFEST_CID;
  if (!value) {
    throw new Error('CID is required. Pass --cid or set MANIFEST_CID.');
  }
  return value;
}

function resolveSeq(options: CliOptions, fallback: number): number {
  if (options.seq && Number.isFinite(options.seq)) {
    return options.seq;
  }
  const envSeq = process.env.SEQ_DEFAULT ? Number(process.env.SEQ_DEFAULT) : Number.NaN;
  if (Number.isFinite(envSeq)) {
    return envSeq;
  }
  return fallback + 1;
}

async function main() {
  const options = parseArgs();
  const identifiers = ensureIdentifiers(options);
  const pool = createPool();
  try {
    const link = await ensureLinkExists(pool, identifiers);
    if (!link.dynamic_id) {
      throw new Error('Dynamic notarization not registered in dpp_links.');
    }

    const setup = await bootstrapNotarization();
    console.log('[setup] rpc', setup.rpcUrl);
    console.log('[setup] package', setup.packageId);
    console.log('[setup] address', setup.address);

    const current = await setup.readonlyClient.getNotarizationById(link.dynamic_id);
    const decoder = new TextDecoder();
    let previousSeq = 0;
    try {
      const currentState = JSON.parse(decoder.decode(current.state.data.toBytes())) as { seq?: number };
      if (typeof currentState.seq === 'number') {
        previousSeq = currentState.seq;
      }
    } catch {
      // ignore parse errors
    }

    const cid = resolveCid(options);
    const seq = resolveSeq(options, previousSeq);
    const updatedState = {
      latest_cid: cid,
      seq,
      updated_at: new Date().toISOString(),
    };
    console.log('[state] payload', JSON.stringify(updatedState));

    const builder = setup.signerClient.updateState(
      State.fromBytes(encoder.encode(JSON.stringify(updatedState))),
      link.dynamic_id,
    );

    const execution = await builder.buildAndExecute(setup.signerClient);

    console.log('[tx] digest', execution.response.digest);
    console.log('[tx] status', execution.response.effects?.status);

    const roResult = await setup.readonlyClient.getNotarizationById(link.dynamic_id);
    console.log('[verify] last_change', roResult.lastStateChangeAt?.toString() ?? 'n/a');
    console.log('[verify] state_version_count', roResult.stateVersionCount.toString());
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
