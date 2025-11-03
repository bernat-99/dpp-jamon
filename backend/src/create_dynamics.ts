// AsÃ­ se ejecuta este script:
// npx tsx src/create_dynamics.ts "QmYvFqdt36xx2T5HnRtM4SXWv9NSVCGTQfnnzZeU2Qtyhd"
// el ID es el CID, obtenido del pin_manifest.ps1

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { NotarizationClient, NotarizationClientReadOnly } from '@iota/notarization/node';

type ManifestShape = {
  latest_cid?: string;
  cid?: string;
  [key: string]: unknown;
};


const DEFAULT_PATH = "m/44'/4218'/0'/0'/0'";
const DEFAULT_STATE_SEQ = 1;
const MANIFEST_RELATIVE = path.join('src', 'manifest_seq1.json');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function resolveCid(): Promise<string> {
  const cliArg = process.argv[2];
  if (cliArg && cliArg.trim()) {
    return cliArg.trim();
  }

  const envCid = process.env.MANIFEST_CID;
  if (envCid && envCid.trim()) {
    return envCid.trim();
  }

  const manifestPath = path.resolve(process.cwd(), MANIFEST_RELATIVE);
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as ManifestShape;
    if (manifest.latest_cid && typeof manifest.latest_cid === 'string') {
      return manifest.latest_cid;
    }
    if (manifest.cid && typeof manifest.cid === 'string') {
      return manifest.cid;
    }
    throw new Error(`No se encontrÃ³ latest_cid/cid en ${manifestPath}`);
  } catch (error) {
    throw new Error(
      `No se pudo resolver el CID. Proporciona CLI, env MANIFEST_CID o ${manifestPath}. Detalle: ${(error as Error).message}`,
    );
  }
}

function resolveSeq(): number {
  const cliArg = process.argv[3];
  if (cliArg) {
    const parsed = Number(cliArg);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const envSeq = process.env.SEQ_DEFAULT;
  if (envSeq) {
    const parsed = Number(envSeq);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return DEFAULT_STATE_SEQ;
}

function bigintToIso(value: bigint | undefined): string {
  if (value === undefined) {
    return 'n/d';
  }
  const asNumber = Number(value) * 1000;
  return Number.isFinite(asNumber) ? new Date(asNumber).toISOString() : value.toString();
}

async function main() {
  const rpcUrl = process.env.IOTA_RPC_URL ?? getFullnodeUrl('testnet');
  const mnemonic = process.env.IOTA_MNEMONIC;
  if (!mnemonic) {
    throw new Error('IOTA_MNEMONIC es obligatorio para derivar el firmante.');
  }
  const derivationPath = process.env.DERIVATION_PATH || DEFAULT_PATH;
  const pkgId = process.env.IOTA_NOTARIZATION_PKG_ID;
  const metadataNote = process.env.NOTARIZATION_METADATA ?? 'pilot joselito / env=testnet';
  const description = process.env.NOTARIZATION_DESCRIPTION ?? 'Pieza DPP â€“ estado vivo';

  console.log(`1ï¸âƒ£ RPC: ${rpcUrl}`);

  const cid = await resolveCid();
  const seq = resolveSeq();
  const updatedAt = new Date().toISOString();
  const statePayload = { latest_cid: cid, seq, updated_at: updatedAt };
  console.log(`2ï¸âƒ£ Datos resueltos -> CID: ${cid} | seq: ${seq}`);

  const iota = new IotaClient({ url: rpcUrl });
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, derivationPath);
  const signer = {
    async sign(txDataBcs: Uint8Array) {
      const { signature } = await keypair.signTransaction(txDataBcs);
      return signature;
    },
    async publicKey() {
      return keypair.getPublicKey();
    },
    async iotaPublicKeyBytes() {
      return keypair.getPublicKey().toIotaBytes();
    },
    keyId() {
      return keypair.toIotaAddress();
    },
  };
  const address = keypair.toIotaAddress();
  console.log(`3ï¸âƒ£ DirecciÃ³n derivada (${derivationPath}): ${address}`);

  const roBootstrap = pkgId
    ? await NotarizationClientReadOnly.createWithPkgId(iota, pkgId)
    : await NotarizationClientReadOnly.create(iota);
  const nc = await NotarizationClient.create(roBootstrap, signer);
  const ro = nc.readOnly();
  const effectivePkg = pkgId ?? (await ro.packageId());
  console.log(`4ï¸âƒ£ Cliente listo (pkgId: ${effectivePkg})`);

  const { output: created, response } = await nc
    .createDynamic()
    .withBytesState(encoder.encode(JSON.stringify(statePayload)), 'DPP jamon: estado inicial')
    .withImmutableDescription(description)
    .withUpdatableMetadata(`${metadataNote} | seq=${seq}`)
    .finish()
    .buildAndExecute(nc);

  console.log(`5ï¸âƒ£ Tx digest: ${response.digest}`);
  console.log(`[Tx status] ${JSON.stringify(response.effects?.status)}`);
  console.log(`[ObjectId] ${created.id}`);

  const notarization = await ro.getNotarizationById(created.id);
  const stateBytes = notarization.state.data.toBytes();
  const stateJson = JSON.parse(decoder.decode(stateBytes));

  console.log('6ï¸âƒ£ VerificaciÃ³n on-chain:');
  console.log(`   â€¢ description: ${notarization.immutableMetadata.description ?? '(sin descripcion)'}`);
  console.log(`   â€¢ updatable metadata: ${notarization.updatableMetadata ?? '(sin metadata)'}`);
  console.log(`   â€¢ state bytes len: ${stateBytes.length}`);
  console.log(`   â€¢ state JSON: ${JSON.stringify(stateJson)}`);
  console.log(`   â€¢ created_at: ${bigintToIso(notarization.immutableMetadata.createdAt)}`);
  console.log(`   â€¢ last_state_change: ${bigintToIso(notarization.lastStateChangeAt)}`);
  console.log(`   â€¢ state_version_count: ${notarization.stateVersionCount.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
