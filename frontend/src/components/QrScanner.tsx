import { useEffect, useRef, useState } from 'react';

type Html5QrcodeModule = typeof import('html5-qrcode');

interface QrScannerProps {
  onDetected: (value: string) => void;
}

export function QrScanner({ onDetected }: QrScannerProps) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const containerIdRef = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Error al detener el escáner', err);
      }
      scannerRef.current = null;
    }
    setActive(false);
  }

  async function startScanner() {
    if (active || loading) {
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const module: Html5QrcodeModule = await import('html5-qrcode');
      const { Html5Qrcode } = module;

      const qrboxSize = Math.min(window.innerWidth - 64, 320);
      const scanner = new Html5Qrcode(containerIdRef.current, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: qrboxSize, height: qrboxSize },
        },
        (decodedText: string) => {
          onDetected(decodedText);
          void stopScanner();
        },
        () => {
          // ignorar errores de frame
        },
      );

      setActive(true);
    } catch (err) {
      console.error(err);
      setError('No se pudo iniciar la cámara. Usa el formulario manual.');
      await stopScanner();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Escanear código QR</h2>
      <div className="stack">
        <button className="btn" onClick={startScanner} disabled={loading || active}>
          {loading ? 'Iniciando…' : active ? 'Escaneando…' : 'Escanear QR'}
        </button>
        {active ? (
          <button className="btn secondary" onClick={() => void stopScanner()}>
            Detener
          </button>
        ) : null}
        {error ? <div className="alert error">{error}</div> : null}
        <div
          id={containerIdRef.current}
          style={{
            width: '100%',
            maxWidth: 360,
            margin: active ? '0 auto' : '-1px auto 0',
            display: active ? 'block' : 'none',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  );
}
