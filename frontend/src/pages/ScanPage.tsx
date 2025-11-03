import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { QrScanner } from '../components/QrScanner';
import { buildResolverPath, isValidGs1, parseFromUrl, type Gs1Parts } from '../lib/gs1';

function buildResultUrl(parts: Gs1Parts): string {
  const params = new URLSearchParams({
    gtin: parts.gtin,
    lot: parts.lot,
    serial: parts.serial,
  });
  return `/result?${params.toString()}`;
}

function buildResultUrlFromRaw(raw: string): string {
  const params = new URLSearchParams({ url: raw });
  return `/result?${params.toString()}`;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleNavigate = (value: string) => {
    const parts = parseFromUrl(value);
    if (parts && isValidGs1(parts)) {
      navigate(buildResultUrl(parts));
      return;
    }

    if (value.startsWith('/resolver/')) {
      const parsed = parseFromUrl(value);
      if (parsed && isValidGs1(parsed)) {
        navigate(buildResultUrl(parsed));
        return;
      }
    }

    if (value.startsWith('http')) {
      const parsed = parseFromUrl(value);
      if (parsed && isValidGs1(parsed)) {
        navigate(buildResultUrl(parsed));
      } else {
        navigate(buildResultUrlFromRaw(value));
      }
      return;
    }

    setError('Formato de enlace GS1 no válido.');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) {
      setError('Introduce un enlace o ruta GS1 Digital Link.');
      return;
    }
    setError(null);
    handleNavigate(value);
  };

  return (
    <div className="stack">
      <div className="card">
        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>Visor DPP • GS1 Digital Link</h1>
        <p style={{ color: '#475569', marginBottom: '1.25rem' }}>
          Escanea un QR GS1 Digital Link o pega la ruta con los AIs 01 (GTIN), 10 (lote) y 21 (serial).
        </p>
        <form className="stack" onSubmit={handleSubmit}>
          <label style={{ fontWeight: 600 }}>Enlace o ruta:</label>
          <input
            type="text"
            placeholder="http://localhost:3000/resolver/01/.../10/.../21/..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          {error ? <div className="alert error">{error}</div> : null}
          <div className="toolbar">
            <button className="btn" type="submit">
              Abrir
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setInput(buildResolverPath({ gtin: '01234567890128', lot: 'L-SECADERO-2025-10-31', serial: '123456' }));
                setError(null);
              }}
            >
              Ejemplo
            </button>
          </div>
        </form>
      </div>
      <QrScanner
        onDetected={(value) => {
          setInput(value);
          setError(null);
          handleNavigate(value);
        }}
      />
    </div>
  );
}
