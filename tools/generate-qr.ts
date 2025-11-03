/**
 * Generate a QR PNG pointing to the public resolver or result URL.
 * Run `npm run qr:generate` after setting PUBLIC_DPP_URL (and optional QR_OUTPUT).
 */
import 'dotenv/config';
import fs from "node:fs";
import path from "node:path";

import QRCode from "qrcode";

const publicUrl = process.env.PUBLIC_DPP_URL;

if (!publicUrl) {
  throw new Error("PUBLIC_DPP_URL is required to create the QR.");
}

const outputPath = process.env.QR_OUTPUT ?? "samples/QR.png";
const resolvedOutput = path.resolve(process.cwd(), outputPath);

await QRCode.toFile(resolvedOutput, publicUrl, {
  margin: 2,
  width: 600,
  errorCorrectionLevel: "M",
});

const stats = fs.statSync(resolvedOutput);
// eslint-disable-next-line no-console
console.log(`[qr] generated ${resolvedOutput} (${stats.size} bytes)`);
