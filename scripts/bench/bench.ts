/**
 * Benchmark helper that runs EPCIS generation -> Pinata -> Dynamic update -> IPFS gateway fetch.
 * Run `npm run bench -- --n 5 --gtin <GTIN> --lot <LOT> --serial <SERIAL>` to capture timings in CSV.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import axios from 'axios';
import { State } from '@iota/notarization/node';
import 'dotenv/config';

import {
  bootstrapNotarization,
  createPool,
  ensureLinkExists,
} from '../notarization/common.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs';
const OUTPUT_DIR = path.resolve('samples', 'bench');

interface CliOptions {
  n: number;
  gtin?: string;
  lot?: string;
  serial?: string;
}

interface BenchmarkRow {
  iteration: number;
  epcisMs: number;
  pinMs: number;
  notarizationMs: number;
  gatewayMs: number;
  cid: string;
  txDigest: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = { n: 1 };
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
      case 'n':
        options.n = Number.parseInt(value, 10);
        break;
      case 'gtin':
        options.gtin = value;
        break;
      case 'lot':
        options.lot = value;
        break;
      case 'serial':
        options.serial = value;
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
    i += 1;
  }
  if (!options.n || Number.isNaN(options.n) || options.n < 1) {
    throw new Error('--n must be a positive integer.');
  }
  return options as CliOptions;
}

function buildEpcisEvent(gtin: string, lot: string, serial: string, gln: string) {
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
    epcList: [`urn:epc:id:sgtin:${gtin.slice(1, 8).padEnd(7, '0')}.${gtin.slice(8)}.${serial}`],
    ilmd: {
      'https://gs1.org/voc/batchNumber': lot,
    },
  };
}

async function pinJson(payload: unknown, name: string | undefined) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error('PINATA_JWT is required for the benchmark.');
  }
  const body: Record<string, unknown> = { pinataContent: payload };
  if (name) {
    body.pinataMetadata = { name };
  }
  const response = await axios.post<{ IpfsHash: string }>(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    body,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  return response.data.IpfsHash;
}

async function fetchGateway(cid: string) {
  const base = process.env.IPFS_GATEWAY_URL ?? DEFAULT_GATEWAY;
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  await axios.get(`${normalized}/${cid}`, { timeout: 30_000 });
}

async function writeCsv(rows: BenchmarkRow[]) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(OUTPUT_DIR, `bench-${timestamp}.csv`);
  const header = 'iteration,epcis_ms,pin_ms,notarization_ms,gateway_ms,cid,tx_digest';
  const lines = rows.map(
    (row) =>
      `${row.iteration},${row.epcisMs.toFixed(2)},${row.pinMs.toFixed(2)},${row.notarizationMs.toFixed(
        2,
      )},${row.gatewayMs.toFixed(2)},${row.cid},${row.txDigest}`,
  );
  await fs.writeFile(filePath, [header, ...lines].join('\n'));
  console.log('[bench] csv', filePath);
}

function now(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

async function main() {
  const options = parseArgs();
  const gtin = options.gtin ?? process.env.DEFAULT_GTIN ?? '01234567890128';
  const lot = options.lot ?? process.env.DEFAULT_LOT ?? 'L-SECADERO-2025-10-31';
  const baseSerial = options.serial ?? process.env.DEFAULT_SERIAL ?? '123456';
  const gln = process.env.DEFAULT_GLN ?? '8437000123456';

  const pool = createPool();
  try {
    const link = await ensureLinkExists(pool, { gtin, lot, serial: baseSerial });
    const setup = await bootstrapNotarization();
    console.log('[bench] rpc', setup.rpcUrl);
    console.log('[bench] package', setup.packageId);

    const rows: BenchmarkRow[] = [];

    let currentSeq = 0;
    const currentState = await setup.readonlyClient.getNotarizationById(link.dynamic_id);
    try {
      const parsed = JSON.parse(decoder.decode(currentState.state.data.toBytes())) as { seq?: number };
      if (typeof parsed.seq === 'number') {
        currentSeq = parsed.seq;
      }
    } catch {
      currentSeq = 0;
    }

    for (let iteration = 1; iteration <= options.n; iteration += 1) {
      const serial = `${baseSerial}-${iteration}`;

      const t0 = now();
      const event = buildEpcisEvent(gtin, lot, serial, gln);
      const t1 = now();

      const cid = await (async () => {
        const start = now();
        const hash = await pinJson(event, `event-${serial}`);
        const end = now();
        rows.push({
          iteration,
          epcisMs: t1 - t0,
          pinMs: end - start,
          notarizationMs: 0,
          gatewayMs: 0,
          cid: hash,
          txDigest: '',
        });
        return hash;
      })();

      currentSeq += 1;
      const updatedState = {
        latest_cid: cid,
        seq: currentSeq,
        updated_at: new Date().toISOString(),
      };

      const notarStart = now();
      const builder = setup.signerClient.updateState(
        State.fromBytes(encoder.encode(JSON.stringify(updatedState))),
        link.dynamic_id,
      );
      const execution = await builder.buildAndExecute(setup.signerClient);
      const notarEnd = now();

      const row = rows[rows.length - 1];
      row.notarizationMs = notarEnd - notarStart;
      row.txDigest = execution.response.digest;

      const gatewayStart = now();
      await fetchGateway(cid);
      const gatewayEnd = now();
      row.gatewayMs = gatewayEnd - gatewayStart;

      console.log(
        `[bench] iteration ${iteration} -> cid=${cid} digest=${execution.response.digest} total_ms=${(
          row.epcisMs +
          row.pinMs +
          row.notarizationMs +
          row.gatewayMs
        ).toFixed(2)}`,
      );
    }

    await writeCsv(rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

