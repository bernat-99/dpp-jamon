import 'dotenv/config';
import { IotaClient, getFullnodeUrl } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { NotarizationClient, NotarizationClientReadOnly } from '@iota/notarization/node';

const RPC = process.env.IOTA_RPC_URL ?? getFullnodeUrl('testnet');
const MNEMONIC = process.env.IOTA_MNEMONIC!;
const PATH = process.env.DERIVATION_PATH || "m/44'/4218'/0'/0'/0'";
const PKG_ID = process.env.IOTA_NOTARIZATION_PKG_ID;

export async function getNotarizationClients() {
  const iota = new IotaClient({ url: RPC });

  // Ed25519Keypair implements the signing interface and exposes toIotaAddress()
  // (BIP-44 derivation for IOTA).
  const kp = Ed25519Keypair.deriveKeypair(MNEMONIC, PATH);

  const signer = {
    async sign(txDataBcs: Uint8Array) {
      const { signature } = await kp.signTransaction(txDataBcs);
      return signature;
    },
    async publicKey() {
      return kp.getPublicKey();
    },
    async iotaPublicKeyBytes() {
      return kp.getPublicKey().toIotaBytes();
    },
    keyId() {
      return kp.toIotaAddress();
    },
  };

  const roInitial = PKG_ID
    ? await NotarizationClientReadOnly.createWithPkgId(iota, PKG_ID)
    : await NotarizationClientReadOnly.create(iota);

  const nc = await NotarizationClient.create(roInitial, signer);
  const ro = nc.readOnly();

  return { iota, kp, signer, ro, nc };
}

async function main() {
  const { kp } = await getNotarizationClients();
  console.log('[OK] NotarizationClient ready');
  console.log('[ADDR]', kp.getPublicKey().toIotaAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
