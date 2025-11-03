import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Badge } from "../components/Badge";
import { KeyValue } from "../components/KeyValue";
import { fetchResolver, type ResolverResponse } from "../lib/api";
import { isValidGs1, parseFromUrl, type Gs1Parts } from "../lib/gs1";
import { formatDate, formatSeq, truncHex } from "../lib/formatting";

type RequestDescriptor = { type: "url"; value: string } | { type: "parts"; value: Gs1Parts };

const gatewayBase = (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) ?? "https://ipfs.io";

export default function ResultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ResolverResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo<RequestDescriptor | { error: string }>(() => {
    const urlParam = searchParams.get("url");
    const gtin = searchParams.get("gtin");
    const lot = searchParams.get("lot");
    const serial = searchParams.get("serial");

    if (urlParam) {
      const fromUrl = parseFromUrl(urlParam);
      if (fromUrl && isValidGs1(fromUrl)) {
        return { type: "parts", value: fromUrl };
      }
      return { type: "url", value: urlParam };
    }

    if (gtin && lot && serial) {
      const parts = { gtin, lot, serial };
      if (!isValidGs1(parts)) {
        return { error: "Parámetros GS1 inválidos." };
      }
      return { type: "parts", value: parts };
    }

    return { error: "Faltan parámetros. Usa /scan para generar un enlace válido." };
  }, [searchParams]);

  const load = useCallback(
    async (descriptor: RequestDescriptor, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response =
          descriptor.type === "url"
            ? await fetchResolver({ url: descriptor.value }, { signal })
            : await fetchResolver({ parts: descriptor.value }, { signal });
        setData(response);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setData(null);
        setError(err instanceof Error ? err.message : "Error desconocido al resolver la petición.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if ("error" in request) {
      setError(request.error);
      setData(null);
      return;
    }
    const controller = new AbortController();
    void load(request, controller.signal);
    return () => controller.abort();
  }, [load, request]);

  const partsForAudit = useMemo(() => {
    if (data) {
      return {
        gtin: data.gs1.gtin,
        lot: data.gs1.lot,
        serial: data.gs1.serial ?? "",
      };
    }
    if ("type" in request && request.type === "parts") {
      return request.value;
    }
    return null;
  }, [data, request]);

  return (
    <div className="stack">
      <div className="card">
        <h1 style={{ fontSize: "1.55rem", marginBottom: "0.75rem" }}>Resultado de la resolución</h1>
        <p style={{ color: "#475569", marginBottom: "1rem" }}>
          Consulta el estado actual de la notarización dinámica y su snapshot locked asociado.
        </p>
        <div className="toolbar">
          <button className="btn secondary" onClick={() => navigate("/scan")}>
            Volver al escáner
          </button>
          {partsForAudit ? (
            <button
              className="btn secondary"
              onClick={() => {
                const params = new URLSearchParams({
                  gtin: partsForAudit.gtin,
                  lot: partsForAudit.lot,
                  serial: partsForAudit.serial,
                });
                navigate(`/audit?${params.toString()}`);
              }}
            >
              Ver detalles de auditoría
            </button>
          ) : null}
          {"type" in request && !("error" in request) ? (
            <button className="btn" onClick={() => load(request)}>
              Refrescar
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <div className="card">Cargando datos…</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      {data ? (
        <>
          <div className="card">
            <h2>Verificación</h2>
            <div className="stack">
              <Badge ok={data.verified} textOk="VERIFIED" textKo="UNVERIFIED" />
              {data.notes.length > 0 ? (
                <div className="alert info">
                  {data.notes.map((note) => (
                    <div key={note}>{note}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <h2>Estado dinámico</h2>
            <div className="kv-grid">
              <KeyValue label="Dynamic ID" value={truncHex(data.id.dynamic)} copyValue={data.id.dynamic} monospace />
              <KeyValue label="Locked ID" value={truncHex(data.id.locked)} copyValue={data.id.locked} monospace />
              <KeyValue label="Último CID" value={truncHex(data.state.latest_cid)} />
              <KeyValue label="Secuencia" value={formatSeq(data.state.seq)} />
              <KeyValue label="Versión" value={formatSeq(data.state.version)} />
              <KeyValue label="Creado" value={formatDate(data.state.created_at)} />
              <KeyValue label="Último cambio" value={formatDate(data.state.last_state_change)} />
            </div>
            {data.state.latest_cid ? (
              <div style={{ marginTop: "1rem" }}>
                <a
                  href={`${gatewayBase}/ipfs/${data.state.latest_cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn secondary"
                >
                  Abrir manifiesto en IPFS
                </a>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2>Snapshot locked</h2>
            <div className="kv-grid">
              <KeyValue label="CID Locked" value={truncHex(data.locked.cid)} />
              <KeyValue label="Creado" value={formatDate(data.locked.created_at)} />
            </div>
          </div>

          {data.manifest.fetched && data.manifest.data ? (
            <div className="card manifest-section">
              <h2>Manifiesto</h2>
              <section>
                <div className="kv-grid">
                  <KeyValue
                    label="Especificación"
                    value={(data.manifest.data as any)?.spec ?? "—"}
                  />
                  <KeyValue
                    label="GTIN (manifest)"
                    value={(data.manifest.data as any)?.scope?.gtin ?? "—"}
                  />
                  <KeyValue
                    label="Lote (manifest)"
                    value={(data.manifest.data as any)?.scope?.lot_id ?? "—"}
                  />
                  <KeyValue
                    label="Secuencia manifiesto"
                    value={formatSeq((data.manifest.data as any)?.seq)}
                  />
                  <KeyValue
                    label="Timestamp"
                    value={formatDate((data.manifest.data as any)?.timestamp)}
                  />
                </div>
              </section>
              <section>
                <div className="code-box">{JSON.stringify(data.manifest.data, null, 2)}</div>
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
