/**
 * Propósito: Publicar una notarización "Locked" (instantánea inmutable) a partir de un CID.
 * Entrada: CID (CLI arg[2] → env MANIFEST_CID → src/manifest_seq1.json.latest_cid/cid).
 * Salida: digest de la transacción, estado y notarizationId; verificación RO confirmando método Locked.
 *
 * Docs: https://docs.iota.org/developer/iota-notarization/how-tos/locked-notarizations/create
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextEncoder } from 'node:util';

import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { NotarizationClient, NotarizationClientReadOnly, TimeLock } from '@iota/notarization/node';

type ManifestShape = {
  latest_cid?: string;
  cid?: string;
  [key: string]: unknown;
};

const DEFAULT_PATH = "m/44'/4218'/0'/0'/0'";
const MANIFEST_RELATIVE = path.join('src', 'manifest_seq1.json');
const encoder = new TextEncoder();

async function resolveCid(arg?: string): Promise<string> {
  const candidate = arg?.trim();
  if (candidate) {
    return candidate;
  }

  const envCid = process.env.MANIFEST_CID?.trim();
  if (envCid) {
    return envCid;
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
    throw new Error(`Propiedades latest_cid/cid ausentes en ${manifestPath}`);
  } catch (error) {
    throw new Error(
      `No se pudo resolver el CID (CLI/env/manifiesto). Detalle: ${(error as Error).message}`,
    );
  }
}

async function main() {
  const rpcUrl = process.env.IOTA_RPC_URL ?? getFullnodeUrl('testnet');
  const mnemonic = process.env.IOTA_MNEMONIC;
  if (!mnemonic) {
    throw new Error('IOTA_MNEMONIC es obligatorio para firmar.');
  }
  const derivationPath = process.env.DERIVATION_PATH || DEFAULT_PATH;
  const pkgId = process.env.IOTA_NOTARIZATION_PKG_ID;

  const cid = await resolveCid(process.argv[2]);

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

  const payload = {
    cid,
    ts: new Date().toISOString(),
  };
  const deleteLock = TimeLock.withNone();

  console.log(`1️⃣ RPC: ${rpcUrl}`);
  console.log(`2️⃣ Dirección: ${keypair.toIotaAddress()}`);
  console.log(`3️⃣ pkgId efectivo: ${pkgId ?? (await ro.packageId())}`);
  console.log(`4️⃣ Snapshot CID: ${cid}`);

  const { output: locked, response } = await nc
    .createLocked()
    .withBytesState(encoder.encode(JSON.stringify(payload)))
    .withImmutableDescription('DPP snapshot (locked)')
    .withDeleteLock(deleteLock)
    .finish()
    .buildAndExecute(nc);

  console.log(`5️⃣ Tx digest: ${response.digest}`);
  console.log(`[Tx status] ${JSON.stringify(response.effects?.status)}`);
  console.log(`[Notarization ID] ${locked.id}`);

  const verification = await ro.getNotarizationById(locked.id);
  const deleteLockType =
    verification.immutableMetadata.locking?.deleteLock?.type ?? '(sin delete lock)';

  console.log('6️⃣ Verificación RO:');
  console.log(`   • method: ${verification.method}`);
  console.log(`   • delete lock: ${deleteLockType}`);
  console.log(`   • state bytes len: ${verification.state.data.toBytes().length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
