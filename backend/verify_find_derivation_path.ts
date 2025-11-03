// find_path.ts
import 'dotenv/config';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}
const MNEMONIC = need('IOTA_MNEMONIC');
const KNOWN = need('IOTA_ADDRESS').toLowerCase();

async function deriveHexAddress(path: string): Promise<string> {
  // Deriva desde mnemonic + derivation path y saca la address
  const kp = Ed25519Keypair.deriveKeypair(MNEMONIC, path);
  return kp.getPublicKey().toIotaAddress().toLowerCase();
}

(async () => {
  for (let account = 0; account <= 2; account++) {
    for (const change of [0, 1] as const) {
      for (let index = 0; index <= 50; index++) {
        const path = `m/44'/4218'/${account}'/${change}'/${index}'`;
        const hex = await deriveHexAddress(path);
        if (hex === KNOWN) {
          console.log('ENCONTRADO ✅', { account, change, index, path, address: hex });
          return;
        }
      }
    }
  }
  console.log('No encontrado en el rango probado ❌');
})();
