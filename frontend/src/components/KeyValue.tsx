import type { ReactNode } from 'react';

interface KeyValueProps {
  label: string;
  value: ReactNode;
  copyValue?: string;
  monospace?: boolean;
}

export function KeyValue({ label, value, copyValue, monospace }: KeyValueProps) {
  const handleCopy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
    } catch (error) {
      console.error('No se pudo copiar al portapapeles', error);
    }
  };

  return (
    <div className="kv-item">
      <span className="label">{label}</span>
      <span className={`value${monospace ? ' monospace' : ''}`}>{value}</span>
      {copyValue ? (
        <button
          className="btn secondary"
          style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
          onClick={handleCopy}
        >
          Copiar
        </button>
      ) : null}
    </div>
  );
}
