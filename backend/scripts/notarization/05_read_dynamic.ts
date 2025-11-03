import 'dotenv/config';
import { getNotarizationClients } from './03_clients';

function normalizeObjectId(id: string) {
  const trimmed = id.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

// Usage: node .../05_read_dynamic.js <DYNAMIC_ID>
async function main() {
  const rawId = process.argv[2];
  if (!rawId) throw new Error('Falta el ID de la notarizacion dinamica');

  const objectId = normalizeObjectId(rawId);
  const { ro } = await getNotarizationClients();

  try {
    console.log('[READONLY] packageId:', await ro.packageId());
    const notarization = await ro.getNotarizationById(objectId);

    const stateBytes = notarization.state.data.toBytes();
    const stateMetadata = notarization.state.metadata ?? '(sin metadata de estado)';
    const description = notarization.immutableMetadata.description ?? '(sin descripcion)';
    const metadata = notarization.updatableMetadata ?? '(sin metadata updatable)';
    const stateString = new TextDecoder().decode(stateBytes);

    console.log('[READONLY] description:', description);
    console.log('[READONLY] metadata:', metadata);
    console.log('[READONLY] state.metadata:', stateMetadata);
    console.log('[READONLY] state.bytes.len:', stateBytes.length);
    console.log('[READONLY] state.asString:', stateString);
    console.log('[READONLY] state.version:', notarization.stateVersionCount.toString());
  } catch (err) {
    console.error('[READONLY] fallo al resolver la notarizacion:', err);

    // Extra context in case the ID is missing on-chain or not yet finalized.
    try {
      const client = ro.iotaClient();
      const rawObject = await client.getObject({ id: objectId, options: { showContent: true } });
      console.error('[DEBUG] Respuesta getObject:', JSON.stringify(rawObject, null, 2));
    } catch (fallbackErr) {
      console.error('[DEBUG] No se pudo obtener el objeto via client.getObject:', fallbackErr);
    }
  }
}

main().catch((e) => {
  if (!process.exitCode) {
    process.exitCode = 1;
  }
});
