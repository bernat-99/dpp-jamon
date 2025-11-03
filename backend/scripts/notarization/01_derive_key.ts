import 'dotenv/config';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';

const MN = process.env.IOTA_MNEMONIC!;
const PATH = process.env.DERIVATION_PATH || "m/44'/4218'/0'/0'/0'";
const EXPECTED = process.env.IOTA_ADDRESS!;

async function main() {
  // Derivación desde mnemonic (por defecto usa 44'/4218'... si no pasas path)
  // Doc: Ed25519Keypair.deriveKeypair(mnemonics, path?)
  const kp = Ed25519Keypair.deriveKeypair(MN, PATH); // ← API oficial
  const derived = kp.getPublicKey().toIotaAddress(); // ← obtener IOTA address

  console.log('[KEY] Derived address:', derived);
  console.log('[KEY] Matches .env IOTA_ADDRESS?', derived === EXPECTED ? 'YES ✅' : 'NO ⚠️');
}

main().catch((e) => { console.error(e); process.exit(1); });
