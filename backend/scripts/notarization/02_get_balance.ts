import 'dotenv/config';
import { IotaClient } from '@iota/iota-sdk/client';

const rpc = process.env.IOTA_RPC_URL!;
const owner = process.env.IOTA_ADDRESS!;

async function main() {
  const client = new IotaClient({ url: rpc }); // conectar al nodo
  // Doc: IotaClient desde @iota/iota-sdk/client y conexión con URL
  // Doc: getBalance({ owner }) (API/params)
  const bal = await client.getBalance({ owner });
  console.log('[BALANCE] coinType:', bal.coinType);
  console.log('[BALANCE] coinObjectCount:', bal.coinObjectCount);
  console.log('[BALANCE] totalBalance:', bal.totalBalance);
}
main().catch((e) => { console.error(e); process.exit(1); });
