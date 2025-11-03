import 'dotenv/config';
import { TextDecoder } from 'node:util';

import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { NotarizationClientReadOnly } from '@iota/notarization/node';

import { toIsoTimestamp } from '../utils/time.js';

const decoder = new TextDecoder();

function normalizeId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('El identificador de notarizacion no puede estar vacio.');
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

export interface VerifyLatestParams {
  dynamicId: string;
  lockedId: string;
  iotaRpcUrl?: string;
  pkgId?: string;
}

export interface VerificationSummary {
  latest_cid: string | null;
  seq: number | null;
  dynamic: {
    version: number | null;
    created_at: string;
    last_state_change: string;
  };
  locked: {
    cid: string | null;
    created_at: string;
  };
  verified: boolean;
  notes: string[];
}

export async function verifyLatestAgainstLocked({
  dynamicId,
  lockedId,
  iotaRpcUrl,
  pkgId,
}: VerifyLatestParams): Promise<VerificationSummary> {
  const rpcUrl = iotaRpcUrl ?? process.env.IOTA_RPC ?? process.env.IOTA_RPC_URL ?? getFullnodeUrl('testnet');
  const dynamicObjectId = normalizeId(dynamicId);
  const lockedObjectId = normalizeId(lockedId);

  const iota = new IotaClient({ url: rpcUrl });
  const roBootstrap = pkgId
    ? await NotarizationClientReadOnly.createWithPkgId(iota as any, pkgId)
    : await NotarizationClientReadOnly.create(iota as any);

  const ro = roBootstrap;
  const notes: string[] = [];

  const dynamic = await ro.getNotarizationById(dynamicObjectId);
  const locked = await ro.getNotarizationById(lockedObjectId);

  const dynamicStateBytes = dynamic.state.data.toBytes();
  const dynamicStateText = decoder.decode(dynamicStateBytes);

  let latestCid: string | null = null;
  let seq: number | null = null;
  try {
    const parsed = JSON.parse(dynamicStateText) as { latest_cid?: string; seq?: number };
    if (typeof parsed.latest_cid === 'string') {
      latestCid = parsed.latest_cid;
    } else {
      notes.push('latest_cid ausente en la notarizacion dinamica.');
    }
    if (typeof parsed.seq === 'number') {
      seq = parsed.seq;
    } else {
      notes.push('seq ausente en la notarizacion dinamica.');
    }
  } catch {
    notes.push('No se pudo parsear el estado dinamico como JSON.');
  }

  const lockedStateBytes = locked.state.data.toBytes();
  const lockedStateText = decoder.decode(lockedStateBytes);
  let lockedCid: string | null = null;
  try {
    const parsedLocked = JSON.parse(lockedStateText) as { cid?: string };
    if (typeof parsedLocked.cid === 'string') {
      lockedCid = parsedLocked.cid;
    } else if (latestCid) {
      notes.push('cid ausente en la notarizacion locked.');
    }
  } catch {
    notes.push('No se pudo parsear el estado locked como JSON.');
  }

  const verified = Boolean(latestCid && lockedCid && latestCid === lockedCid);
  if (!verified) {
    notes.push('El CID del snapshot locked no coincide con latest_cid del dinamico.');
  }

  return {
    latest_cid: latestCid,
    seq,
    dynamic: {
      version: Number(dynamic.stateVersionCount),
      created_at: toIsoTimestamp(dynamic.immutableMetadata.createdAt),
      last_state_change: toIsoTimestamp(dynamic.lastStateChangeAt),
    },
    locked: {
      cid: lockedCid,
      created_at: toIsoTimestamp(locked.immutableMetadata.createdAt),
    },
    verified,
    notes,
  };
}
