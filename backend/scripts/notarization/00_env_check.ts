import 'dotenv/config';

const must = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k} en .env`);
  return v;
};

const rpc = must('IOTA_RPC_URL');
const addr = must('IOTA_ADDRESS');
const path = process.env.DERIVATION_PATH || "m/44'/4218'/0'/0'/0'";

console.log('[ENV] RPC:', rpc);
console.log('[ENV] ADDRESS (masked):', addr.slice(0, 10) + '...' + addr.slice(-6));
console.log('[ENV] DERIVATION_PATH:', path);
