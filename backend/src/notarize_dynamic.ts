import 'dotenv/config';
import { IotaClient, getFullnodeUrl} from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { NotarizationClient } from '@iota/notarization/node';
import axios from 'axios';
import {readFileSync} from 'fs';

const rpc = process.env.IOTA_RPC_URL!;
const faucet = process.env.IOTA_FAUCET_URL!;

async function main() {
  // 1) Clave efímera para pruebas (en real: guarda la seed segura)
  const kp = Ed25519Keypair.generate();
  const address = kp.getPublicKey().toSuiAddress(); // mismo formato de address usado por SDK

  console.log('Testnet address:', address);

  // 2) Pide fondos al faucet testnet
  await axios.post(faucet, { FixedAmountRequest: { recipient: address }});
  console.log('Faucet requested. Espera unos segundos...');

  // 3) Inicializa clientes
  const client = new IotaClient({ url: rpc });
  const nc = await NotarizationClient.connect(client);
  

  // 4) Lee el CID del manifiesto
  const manifest = JSON.parse(fs.readFileSync('./src/manifest_seq1.json','utf8'));
  const cid = process.argv[2]; // pásalo por CLI: node dist/notarize_dynamic.js bafy...

  // 5) Crea notarización dinámica con estado inicial
  const { notarizationId } = await nc.createDynamic({
    state: JSON.stringify({ latest_cid: cid, seq: 1, updated_at: new Date().toISOString() }),
    metadata: 'DPP jamón: estado inicial'
  }, kp);

  console.log('Dynamic Notarization ID:', notarizationId);
}

main().catch(e => { console.error(e); process.exit(1); });
