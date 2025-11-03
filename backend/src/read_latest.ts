// Así se ejecuta este script:
// npx tsx src/read_latest.ts f76468418465731df16549b4d76df0c80c9480b827dc1907ed38345507c81fbd
// el ID es el ID de la notarización a consultar que se obtiene de create_dynamics.ts

import 'dotenv/config';
import { TextDecoder } from 'node:util';

import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { NotarizationClientReadOnly } from '@iota/notarization/node';

const decoder = new TextDecoder();

function normalizeId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('El ID de notarización no puede estar vacío.');
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function resolveNotarizationId(): string {
  const cli = process.argv[2];
  if (cli) {
    return normalizeId(cli);
  }

  const envId = process.env.NOTARIZATION_ID ?? process.env.LAST_NOTARIZATION_ID;
  if (envId) {
    return normalizeId(envId);
  }

  throw new Error(
    'Proporciona el ID de la notarización (CLI o env NOTARIZATION_ID). Consulta el log de src/create_dynamics.ts.',
  );
}

function toIso(seconds?: bigint): string {
  if (seconds === undefined) {
    return 'n/d';
  }
  const millis = Number(seconds) * 1000;
  return Number.isFinite(millis) ? new Date(millis).toISOString() : seconds.toString();
}

async function main() {
  const rpcUrl = process.env.IOTA_RPC_URL ?? getFullnodeUrl('testnet');
  const objectId = resolveNotarizationId();
  const pkgId = process.env.IOTA_NOTARIZATION_PKG_ID;

  console.log(`RPC: ${rpcUrl}`);
  console.log(`Notarization ID: ${objectId}`);

  const iota = new IotaClient({ url: rpcUrl });
  const ro = pkgId
    ? await NotarizationClientReadOnly.createWithPkgId(iota, pkgId)
    : await NotarizationClientReadOnly.create(iota);
  const effectivePkg = pkgId ?? (await ro.packageId());
  console.log(`Package ID: ${effectivePkg}`);

  const notarization = await ro.getNotarizationById(objectId);

  const description = notarization.immutableMetadata.description ?? '(sin descripcion)';
  const metadata = notarization.updatableMetadata ?? '(sin metadata)';
  const createdAt = toIso(notarization.immutableMetadata.createdAt);
  const lastStateChange = toIso(notarization.lastStateChangeAt);
  const versionCount = Number(notarization.stateVersionCount);

  const stateBytes = notarization.state.data.toBytes();
  const stateText = decoder.decode(stateBytes);
  let latestCid: string | null = null;
  let seq: number | null = null;

  try {
    const parsed = JSON.parse(stateText) as { latest_cid?: string; seq?: number };
    if (typeof parsed.latest_cid === 'string') {
      latestCid = parsed.latest_cid;
    }
    if (typeof parsed.seq === 'number') {
      seq = parsed.seq;
    }
  } catch {
    // Payload not JSON; ignore.
  }

  console.log(`Description: ${description}`);
  console.log(`Metadata: ${metadata}`);
  console.log(`State bytes length: ${stateBytes.length}`);
  console.log(`State metadata: ${notarization.state.metadata ?? '(sin metadata en estado)'}`);
  console.log(`Version count: ${versionCount}`);
  console.log(`Created at: ${createdAt}`);
  console.log(`Last state change: ${lastStateChange}`);

  const summary = {
    id: objectId,
    latest_cid: latestCid,
    seq,
    version: versionCount,
    created_at: createdAt,
    last_state_change: lastStateChange,
  };

  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
