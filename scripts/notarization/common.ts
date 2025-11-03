/**
 * Helper utilities for the notarization CLI scripts.
 * Import from these helpers inside scripts under `scripts/notarization`
 * to reuse database bindings and IOTA notarization client bootstrapping.
 */
import 'dotenv/config';
import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import {
  NotarizationClient,
  NotarizationClientReadOnly,
} from '@iota/notarization/node';
import type { TransactionSigner } from '@iota/notarization/node/notarization_wasm';
import { Pool } from 'pg';

export const DEFAULT_DERIVATION_PATH = "m/44'/4218'/0'/0'/0'";
export const LOCKED_PENDING_VALUE = 'PENDING';

export interface LinkKey {
  gtin: string;
  lot: string;
  serial: string;
}

export interface LinkRow extends LinkKey {
  dynamic_id: string;
  locked_id: string;
}

export interface NotarizationSetup {
  iota: IotaClient;
  readonlyClient: NotarizationClientReadOnly;
  signerClient: NotarizationClient;
  address: string;
  packageId: string;
  rpcUrl: string;
}

export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString });
  }

  return new Pool({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'dpp',
    ssl: process.env.PGSSLMODE === 'require',
  });
}

export async function fetchLink(pool: Pool, key: LinkKey): Promise<LinkRow | null> {
  const { rows } = await pool.query<LinkRow>(
    `SELECT gtin, lot, serial, dynamic_id, locked_id
       FROM dpp_links
      WHERE gtin = $1 AND lot = $2 AND serial = $3`,
    [key.gtin, key.lot, key.serial],
  );
  return rows[0] ?? null;
}

export async function upsertDynamicLink(
  pool: Pool,
  key: LinkKey,
  dynamicId: string,
): Promise<LinkRow> {
  const { rows } = await pool.query<LinkRow>(
    `INSERT INTO dpp_links (gtin, lot, serial, dynamic_id, locked_id)
         VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (gtin, lot, serial)
      DO UPDATE SET dynamic_id = EXCLUDED.dynamic_id
      RETURNING gtin, lot, serial, dynamic_id, locked_id`,
    [key.gtin, key.lot, key.serial, dynamicId, LOCKED_PENDING_VALUE],
  );
  return rows[0];
}

export async function updateLockedLink(
  pool: Pool,
  key: LinkKey,
  lockedId: string,
): Promise<LinkRow> {
  const { rows } = await pool.query<LinkRow>(
    `UPDATE dpp_links
        SET locked_id = $4
      WHERE gtin = $1 AND lot = $2 AND serial = $3
      RETURNING gtin, lot, serial, dynamic_id, locked_id`,
    [key.gtin, key.lot, key.serial, lockedId],
  );
  if (rows.length === 0) {
    throw new Error('dpp_links entry not found. Did you run create_dynamic first?');
  }
  return rows[0];
}

export async function ensureLinkExists(pool: Pool, key: LinkKey): Promise<LinkRow> {
  const row = await fetchLink(pool, key);
  if (!row) {
    throw new Error(
      `Mapping for gtin=${key.gtin}, lot=${key.lot}, serial=${key.serial} not found. Run the create script first.`,
    );
  }
  return row;
}

export async function bootstrapNotarization(): Promise<NotarizationSetup> {
  const rpc = process.env.IOTA_RPC ?? getFullnodeUrl('testnet');
  const mnemonic = process.env.IOTA_MNEMONIC;
  if (!mnemonic) {
    throw new Error('IOTA_MNEMONIC is required to derive the signer.');
  }
  const derivationPath = process.env.DERIVATION_PATH || DEFAULT_DERIVATION_PATH;
  const pkgId = process.env.IOTA_PACKAGE_ID;

  const iota = new IotaClient({ url: rpc });
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, derivationPath);
  const address = keypair.toIotaAddress();

  const signer: TransactionSigner = {
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
      return address;
    },
  };

  const readonlyClient = pkgId
    ? await NotarizationClientReadOnly.createWithPkgId(iota, pkgId)
    : await NotarizationClientReadOnly.create(iota);
  const signerClient = await NotarizationClient.create(readonlyClient, signer);
  const resolvedPkgId = pkgId ?? (await readonlyClient.packageId());

  return {
    iota,
    readonlyClient,
    signerClient,
    address,
    packageId: resolvedPkgId,
    rpcUrl: rpc,
  };
}
