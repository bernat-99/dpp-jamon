/**
 * Resolver router for GS1 Digital Link lookups.
 * Run `npm run serve` to start Express exposing `/resolver/01/:gtin/10/:lot/21/:serial`.
 * It verifies Dynamic vs Locked notarizations using PostgreSQL mappings.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import type { Request, Response } from "express";
import axios from "axios";
import { Pool } from "pg";

import { verifyLatestAgainstLocked } from "../verify/notarization-verify.js";
import { toIsoTimestamp } from "../utils/time.js";

type RegistryRow = {
  dynamic_id: string;
  locked_id: string;
};

function normalizeId(id: string) {
  return id.startsWith("0x") ? id : `0x${id}`;
}

async function fetchManifest(cid: string) {
  const gatewayBase = (process.env.IPFS_GATEWAY_URL ?? "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");
  const url = `${gatewayBase}/${cid}`;
  const headers: Record<string, string> = {};
  const pinataJwt = process.env.PINATA_JWT;
  if (pinataJwt) {
    headers.Authorization = `Bearer ${pinataJwt}`;
  }

  const response = await axios.get(url, {
    headers,
    timeout: Number(process.env.IPFS_GATEWAY_TIMEOUT_MS ?? 15000),
  });

  return response.data;
}

export function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString });
  }

  return new Pool({
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD ?? "postgres",
    database: process.env.PGDATABASE ?? "dpp",
    ssl: process.env.PGSSLMODE === "require",
  });
}

export function createResolverRouter(pool?: Pool) {
  const resolverPool = pool ?? buildPool();
  const router = express.Router();

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
    : null;

  if (allowedOrigins && allowedOrigins.length > 0) {
    router.use(
      cors({
        origin: allowedOrigins,
      }),
    );
  }

  router.get("/resolver/01/:gtin/10/:lot/21/:serial?", async (req: Request, res: Response) => {
    try {
      const { gtin, lot, serial } = req.params as { gtin: string; lot: string; serial?: string };
      const serialValue = serial ?? "";

      const { rows } = await resolverPool.query<RegistryRow>(
        `SELECT dynamic_id, locked_id
           FROM dpp_links
          WHERE gtin = $1 AND lot = $2 AND serial = $3`,
        [gtin, lot, serialValue],
      );

      if (rows.length === 0) {
        res.status(404).json({
          error: "NO_MAPPING",
          message: "No se encontro una asociacion para el identificador GS1 proporcionado.",
        });
        return;
      }

      const entry = rows[0];

      const lockedId = entry.locked_id;
      if (!lockedId || lockedId.toUpperCase() === 'PENDING') {
        res.status(409).json({
          error: 'LOCKED_NOT_READY',
          message: 'Locked notarization not yet registered for this GS1 identifier.',
        });
        return;
      }

      const verification = await verifyLatestAgainstLocked({
        dynamicId: entry.dynamic_id,
        lockedId,
        pkgId: process.env.IOTA_NOTARIZATION_PKG_ID,
      });

      let manifestData: unknown = null;
      if (verification.latest_cid) {
        try {
          manifestData = await fetchManifest(verification.latest_cid);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Fallo al acceder al gateway IPFS.";
          res.status(502).json({
            error: "IPFS_UNAVAILABLE",
            message,
          });
          return;
        }
      }

      res.json({
        id: {
          dynamic: normalizeId(entry.dynamic_id),
          locked: normalizeId(lockedId),
        },
        gs1: {
          gtin,
          lot,
          serial: serial ?? null,
        },
        state: {
          latest_cid: verification.latest_cid,
          seq: verification.seq,
          version: verification.dynamic.version,
          created_at: verification.dynamic.created_at,
          last_state_change: verification.dynamic.last_state_change,
        },
        locked: {
          cid: verification.locked.cid,
          created_at: verification.locked.created_at,
        },
        verified: verification.verified,
        notes: verification.notes,
        manifest: verification.latest_cid
          ? { fetched: true, data: manifestData }
          : { fetched: false },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado en el resolver.";
      res.status(500).json({
        error: "UNEXPECTED_ERROR",
        message,
      });
    }
  });

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      time: toIsoTimestamp(BigInt(Date.now())),
    });
  });

  return router;
}

