import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { NotarizationClient, NotarizationClientReadOnly, State } from '@iota/notarization/node';

type ManifestShape = {
  latest_cid?: string;
  cid?: string;
  seq?: number;
  [key: string]: unknown;
};

const DEFAULT_PATH = "m/44'/4218'/0'/0'/0'";
const DEFAULT_SEQ = 2;
const MANIFEST_RELATIVE = path.join('src', 'manifest_seq1.json');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeId(raw?: string): string {
  if (!raw) {
    throw new Error('Falta NOTARIZATION_ID (CLI o env NOTARIZATION_ID).');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('El ID de notarización no puede estar vacío.');
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

async function resolveCid(arg: string | undefined, fallback?: string): Promise<string> {
  const trimmed = arg?.trim();
  if (trimmed && trimmed !== '-' && trimmed.toLowerCase() !== 'same') {
    return trimmed;
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
  } catch (error) {
    if (fallback) {
      return fallback;
    }
    throw new Error(
      `No se pudo resolver el CID. Usa CLI, env MANIFEST_CID o ${manifestPath}. Detalle: ${(error as Error).message}`,
    );
  }
  if (fallback) {
    return fallback;
  }
  throw new Error('No se pudo determinar un CID para el estado.');
}

async function resolveSeq(arg: string | undefined, fallback?: number): Promise<number> {
  const trimmed = arg?.trim();
  if (trimmed && trimmed !== '-') {
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    throw new Error('SEQ inválido.');
  }
  const envSeq = process.env.MANIFEST_SEQ;
  if (envSeq) {
    const parsed = Number(envSeq);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const manifestPath = path.resolve(process.cwd(), MANIFEST_RELATIVE);
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as ManifestShape;
    if (typeof manifest.seq === 'number') {
      return manifest.seq;
    }
  } catch {
    // ignore manifest read errors; fall back to default
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback + 1;
  }
  return DEFAULT_SEQ;
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
  const mnemonic = process.env.IOTA_MNEMONIC;
  if (!mnemonic) {
    throw new Error('IOTA_MNEMONIC es obligatorio.');
  }
  const derivationPath = process.env.DERIVATION_PATH || DEFAULT_PATH;
  const pkgId = process.env.IOTA_NOTARIZATION_PKG_ID;

  const notarizationId = normalizeId(process.argv[2] ?? process.env.NOTARIZATION_ID);
  const newCid = await resolveCid(process.argv[3]);
  const newSeq = await resolveSeq(process.argv[4]);

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

  const roBootstrap = pkgId
    ? await NotarizationClientReadOnly.createWithPkgId(iota as any, pkgId)
    : await NotarizationClientReadOnly.create(iota as any);
  const nc = await NotarizationClient.create(roBootstrap, signer);
  const ro = nc.readOnly();

  const effectivePkg = pkgId ?? (await ro.packageId());
  const statePayload = { latest_cid: newCid, seq: newSeq, updated_at: new Date().toISOString() };
  const newState = State.fromBytes(encoder.encode(JSON.stringify(statePayload)));

  console.log(`1️⃣ RPC: ${rpcUrl}`);
  console.log(`2️⃣ Notarization ID: ${notarizationId}`);
  console.log(`3️⃣ Dirección: ${keypair.toIotaAddress()}`);
  console.log(`4️⃣ pkgId efectivo: ${effectivePkg}`);
  console.log(`5️⃣ Nuevo estado: ${JSON.stringify(statePayload)}`);

  const builder = nc.updateState(newState, notarizationId);
  const { response } = await builder.buildAndExecute(nc);

  console.log(`6️⃣ Tx digest: ${response.digest}`);
  console.log(`[Tx status] ${JSON.stringify(response.effects?.status)}`);

  const notarization = await ro.getNotarizationById(notarizationId);
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
    // ignore parse errors
  }

  console.log('7️⃣ Verificación posterior:');
  console.log(`   • description: ${notarization.immutableMetadata.description ?? '(sin descripcion)'}`);
  console.log(`   • metadata: ${notarization.updatableMetadata ?? '(sin metadata)'}`);
  console.log(`   • state bytes len: ${stateBytes.length}`);
  console.log(`   • state metadata: ${notarization.state.metadata ?? '(sin metadata en estado)'}`);
  console.log(`   • state version count: ${notarization.stateVersionCount.toString()}`);
  console.log(`   • created_at: ${toIso(notarization.immutableMetadata.createdAt)}`);
  console.log(`   • last_state_change: ${toIso(notarization.lastStateChangeAt)}`);
  if (latestCid) {
    console.log(`   • state.latest_cid: ${latestCid}`);
  }
  if (seq !== null) {
    console.log(`   • state.seq: ${seq}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
