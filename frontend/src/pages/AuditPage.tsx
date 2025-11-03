import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Badge } from "../components/Badge";
import { KeyValue } from "../components/KeyValue";
import { fetchResolver, type ResolverResponse } from "../lib/api";
import { buildResolverPath, isValidGs1, type Gs1Parts } from "../lib/gs1";
import { formatDate, formatSeq, truncHex } from "../lib/formatting";

interface RequestParams {
  gtin: string;
  lot: string;
  serial: string;
}

const gatewayBase = (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) ?? "https://ipfs.io";

export default function AuditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ResolverResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo<RequestParams | null>(() => {
    const gtin = searchParams.get("gtin");
    const lot = searchParams.get("lot");
    const serial = searchParams.get("serial");
    if (!gtin || !lot || !serial) {
      return null;
    }
    const parts: Gs1Parts = { gtin, lot, serial };
    if (!isValidGs1(parts)) {
      return null;
    }
    return parts;
  }, [searchParams]);

  const load = useCallback(
    async (descriptor: RequestParams, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchResolver({ parts: descriptor }, { signal });
        setData(response);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setData(null);
        setError(err instanceof Error ? err.message : "Error desconocido.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!params) {
      setError("Parámetros inválidos. Usa /scan para seleccionar un identificador.");
      setData(null);
      return;
    }
    const controller = new AbortController();
    void load(params, controller.signal);
    return () => controller.abort();
  }, [load, params]);

  if (!params) {
    return (
      <div className="card">
        <h1>Auditoría</h1>
        <div className="alert error" style={{ marginTop: "1rem" }}>
          No se proporcionaron parámetros válidos.
        </div>
        <button className="btn" style={{ marginTop: "1rem" }} onClick={() => navigate("/scan")}>
          Volver a escanear
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <h1 style={{ fontSize: "1.55rem", marginBottom: "0.75rem" }}>Panel de auditoría</h1>
        <p style={{ color: "#475569", marginBottom: "1rem" }}>
          Información detallada de las notarizaciones Dynamic y Locked asociadas a este identificador GS1.
        </p>
        <div className="toolbar">
          <button
            className="btn secondary"
            onClick={() => navigate('/result?' + new URLSearchParams(params).toString())}
          >
            Volver al resumen
          </button>
          <button className="btn" onClick={() => load(params)} disabled={loading}>
            Refrescar
          </button>
        </div>
      </div>

      {loading ? <div className="card">Cargando datos…</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      {data ? (
        <>
          <div className="card">
            <h2>Verificación</h2>
            <Badge ok={data.verified} textOk="VERIFIED" textKo="UNVERIFIED" />
            {data.notes.length > 0 ? (
              <div className="alert info" style={{ marginTop: "1rem" }}>
                {data.notes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2>Identificadores</h2>
            <div className="kv-grid">
              <KeyValue label="Dynamic ID" value={truncHex(data.id.dynamic)} copyValue={data.id.dynamic} monospace />
              <KeyValue label="Locked ID" value={truncHex(data.id.locked)} copyValue={data.id.locked} monospace />
              <KeyValue
                label="Ruta GS1"
                value={buildResolverPath({ gtin: params.gtin, lot: params.lot, serial: params.serial })}
                copyValue={buildResolverPath({ gtin: params.gtin, lot: params.lot, serial: params.serial })}
                monospace
              />
            </div>
          </div>

          <div className="card">
            <h2>Dynamic notarization</h2>
            <div className="kv-grid">
              <KeyValue label="Último CID" value={truncHex(data.state.latest_cid)} />
              <KeyValue label="Secuencia" value={formatSeq(data.state.seq)} />
              <KeyValue label="Versión" value={formatSeq(data.dynamic?.version ?? data.state.version)} />
              <KeyValue label="Creado" value={formatDate(data.dynamic?.created_at ?? data.state.created_at)} />
              <KeyValue
                label="Último cambio"
                value={formatDate(data.dynamic?.last_state_change ?? data.state.last_state_change)}
              />
            </div>
          </div>

          <div className="card">
            <h2>Locked snapshot</h2>
            <div className="kv-grid">
              <KeyValue label="CID Locked" value={truncHex(data.locked.cid)} />
              <KeyValue label="Creado" value={formatDate(data.locked.created_at)} />
            </div>
            {data.locked.cid ? (
              <div style={{ marginTop: "1rem" }}>
                <a
                  href={`${gatewayBase}/ipfs/${data.locked.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn secondary"
                >
                  Abrir snapshot en IPFS
                </a>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2>Manifiesto completo</h2>
            <div className="code-box">
              {data.manifest.fetched && data.manifest.data
                ? JSON.stringify(data.manifest.data, null, 2)
                : "No se pudo recuperar el manifiesto desde IPFS."}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
