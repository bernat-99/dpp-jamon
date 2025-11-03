import 'dotenv/config';
import { getNotarizationClients } from './03_clients';

// Usage: node dist-backend/scripts/notarization/04_create_dynamic.js <CID>
async function main() {
  const cid = process.argv[2];
  if (!cid) throw new Error('Falta CID como argumento CLI');

  const { nc } = await getNotarizationClients();

  const stateObj = {
    latest_cid: cid,
    seq: 1,
    updated_at: new Date().toISOString(),
  };

  const utf8 = new TextEncoder();

  const result = await nc
    .createDynamic()
    .withBytesState(utf8.encode(JSON.stringify(stateObj)), 'DPP jamon: estado inicial')
    .withImmutableDescription('Pieza DPP - estado vivo')
    .withUpdatableMetadata('pilot joselito / env=testnet')
    .finish()
    .buildAndExecute(nc);

  const { output: dynamic, response } = result;
  const stringify = (value: unknown) =>
    JSON.stringify(
      value,
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    );

  console.log('[DEBUG] transaction status:', response.effects?.status);
  console.log('[DEBUG] response digest:', response.digest);
  console.log('[DEBUG] response:', stringify(response));
  console.log('[DEBUG] dynamic output:', stringify(dynamic));
  console.log('[DYNAMIC] created id:', dynamic.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
