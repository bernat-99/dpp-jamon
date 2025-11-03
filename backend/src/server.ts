/**
 * Express bootstrap that serves both the resolver API and the built frontend.
 * Run `npm run serve` from the repo root to start the unified server.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { buildPool, createResolverRouter } from './http/resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const pool = buildPool();
app.use(createResolverRouter(pool));

const distDir = path.resolve(__dirname, '../../frontend/dist');
const indexHtml = path.join(distDir, 'index.html');

if (process.env.NODE_ENV !== 'test') {
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (!req.accepts('html')) {
        next();
        return;
      }
      res.sendFile(indexHtml, (err) => {
        if (err) {
          next(err);
        }
      });
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[WARN] frontend/dist no encontrado. Ejecuta "npm run build:frontend" para generar el build.');
  }
}

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[OK] DPP resolver & viewer ready on http://localhost:${port}`);
});
