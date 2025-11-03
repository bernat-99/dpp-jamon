/**
 * Upload a JSON document to Pinata using the PINATA_JWT environment variable.
 * Run `npm run ipfs:pin -- --file samples/epcis/event-001.json` or pipe JSON through stdin.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

import axios from 'axios';

const PIN_ENDPOINT = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const REGISTRY_FILE = path.resolve('samples', 'cids.json');

interface CliOptions {
  file?: string;
  name?: string;
}

interface PinResult {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface RegistryEntry {
  cid: string;
  timestamp: string;
  source: string;
}

async function parseArgs(): Promise<CliOptions> {
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
      case 'file':
        options.file = value;
        break;
      case 'name':
        options.name = value;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
    i += 1;
  }
  return options;
}

async function readPayload(options: CliOptions): Promise<unknown> {
  if (options.file) {
    const raw = await fs.readFile(options.file, 'utf8');
    return JSON.parse(raw);
  }
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      throw new Error('No JSON received via stdin.');
    }
    return JSON.parse(raw);
  }
  throw new Error('Provide --file <path> or pipe JSON through stdin.');
}

async function appendRegistry(entry: RegistryEntry) {
  await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  let content: RegistryEntry[] = [];
  try {
    const raw = await fs.readFile(REGISTRY_FILE, 'utf8');
    content = JSON.parse(raw) as RegistryEntry[];
  } catch {
    content = [];
  }
  content.push(entry);
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(content, null, 2));
}

async function main() {
  const options = await parseArgs();
  const payload = await readPayload(options);

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error('PINATA_JWT is required to authenticate with Pinata.');
  }

  const body: Record<string, unknown> = { pinataContent: payload };
  if (options.name) {
    body.pinataMetadata = { name: options.name };
  }

  const response = await axios.post<PinResult>(PIN_ENDPOINT, body, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });

  console.log('[pinata] cid', response.data.IpfsHash);
  console.log('[pinata] size', response.data.PinSize);
  console.log('[pinata] timestamp', response.data.Timestamp);

  await appendRegistry({
    cid: response.data.IpfsHash,
    timestamp: new Date().toISOString(),
    source: options.file ?? 'stdin',
  });
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
