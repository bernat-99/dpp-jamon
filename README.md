# DPP Jamon MVP

Repositorio autocontenido para reproducir el flujo Digital Product Passport (Jamon) extremo a extremo:

```
EPCIS JSON-LD -> Pinata/IPFS -> IOTA Notarization (Dynamic/Locked) -> Resolver GS1 Digital Link -> Visor web -> QR
```

El codigo reutiliza los experimentos locales del proyecto original y los empaqueta en una guia unica.

## Requisitos previos

- Node.js 20+
- npm 10+
- Docker Desktop (para PostgreSQL/TimescaleDB)
- Cuenta Pinata con token JWT
- Acceso a IOTA testnet (faucet opcional)
- Opcional: ngrok para exponer el visor en publico

## Variables de entorno

Copia `.env.example` a `.env` y rellena al menos:

```
IOTA_MNEMONIC="<tus 24 palabras>"
PINATA_JWT="<token JWT>"
```

La entrada `DATABASE_URL` apunta al contenedor PostgreSQL. Ajusta `DEFAULT_*` si manejas otros GTIN/lot/serial.

## Puesta en marcha

1. **Instalar dependencias**
   ```bash
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```
2. **Levantar la base de datos**
   ```bash
   docker-compose up -d
   ```
   Ejecuta `backend/db/init.sql` y `backend/db/seed_min.sql` contra la base (TimescaleDB) para crear el esquema y los datos minimos.
3. **Build del visor**
   ```bash
   npm run build:frontend
   ```
4. **Servidor unificado**
   ```bash
   npm run serve
   ```
   - `http://localhost:3000/scan` -> visor publico (Vite bundle)
   - `http://localhost:3000/resolver/01/<gtin>/10/<lot>/21/<serial>` -> API GS1 Digital Link

Para desarrollo desacoplado usa el tip al final de `docs/deploy.md` (`CORS_ORIGIN` + `VITE_API_BASE`).

## Scripts TypeScript

Todos los scripts estan bajo `scripts/` y comparten utilidades en `scripts/notarization/common.ts`.

| Comando | Descripcion |
|---------|-------------|
| `npm run epcis:gen -- --gtin <GTIN> --lot <LOT> --serial <SERIAL>` | Genera un ObjectEvent EPCIS 2.0 y lo guarda en `samples/epcis/`. |
| `npm run ipfs:pin -- --file samples/epcis/event-001.json --name epcis-demo` | Pin JSON en Pinata (usa `PINATA_JWT`). Guarda el CID en `samples/cids.json`. |
| `npm run dpp:create -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID>` | Crea una Dynamic notarization y actualiza `dpp_links`. |
| `npm run dpp:update -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID>` | Publica un nuevo estado Dynamic (seq auto-incrementa). |
| `npm run dpp:lock -- --gtin <GTIN> --lot <LOT> --serial <SERIAL> --cid <CID>` | Crea la Locked y actualiza `dpp_links`. |
| `npm run bench -- --n 100 --gtin <GTIN> --lot <LOT> --serial <SERIAL>` | Ejecuta el pipeline completo 100 veces y deja un CSV en `samples/bench/`. |
| `npm run qr:generate` | Genera `samples/QR.png` usando `PUBLIC_DPP_URL`. |

> Todos los scripts imprimen logs paso a paso y requieren que `.env` este configurado.

## Resolver GS1 + visor web

- El backend (`backend/src/server.ts`) sirve la SPA precompilada y el resolver.
- El resolver consulta PostgreSQL (`dpp_links`) y valida Dynamic/Locked via IOTA.
- Al encontrar `locked_id = PENDING` responde `409 LOCKED_NOT_READY`.
- El visor (frontend/) permite leer codigos GS1 Digital Link (`/scan`), mostrar estado resumido (`/result`) y los detalles de auditoria (`/audit`).

Para publicar un QR listo para moviles:

1. Obten una URL publica con `ngrok http 3000`.
2. Exporta `PUBLIC_DPP_URL=https://<ngrok>/result?gtin=...&lot=...&serial=...`.
3. Ejecuta `npm run qr:generate` -> revisa `samples/QR.png`.

## Base de datos

Tabla minima `dpp_links`:

```sql
CREATE TABLE dpp_links (
  gtin TEXT NOT NULL,
  lot  TEXT NOT NULL,
  serial TEXT NOT NULL,
  dynamic_id TEXT NOT NULL,
  locked_id  TEXT NOT NULL,
  PRIMARY KEY (gtin, lot, serial)
);
```

Los scripts usan `INSERT ... ON CONFLICT` para actualizar `dynamic_id` y `UPDATE` para `locked_id`.

## Coleccion Postman

`postman/DPP.postman_collection.json` incluye:

- `Pinata - pinJSONToIPFS`
- `CLI - npm run dpp:create`
- `CLI - npm run dpp:update`
- `CLI - npm run dpp:lock`
- `Resolver GS1`

Importa la coleccion, ajusta las variables (`gtin`, `lot`, `serial`, `cid`, `resolver_base`, `pinata_jwt`) y utiliza las entradas como guia rapida.

## Samples

- `samples/cids.json` -> lista de CIDs reales.
- `samples/tx.json` -> Dynamic/Locked IDs + digest.
- `samples/resolver-output.json` -> respuesta del resolver sobre los datos de prueba.
- `samples/epcis/` -> eventos EPCIS generados con el script.
- `samples/bench/` -> CSV de latencias.
- `samples/QR.png` -> QR listo para impresion.

## Publicacion

1. Ejecuta `docker-compose up -d`.
2. Arranca backend con `npm run serve`.
3. (Opcional) expon con `ngrok http 3000` y actualiza `PUBLIC_DPP_URL` antes de generar el QR.
4. Verifica desde movil con la URL publica (`/scan`) y la API (`/resolver/...`).

## Licencia

MIT. Consulta `LICENSE` si necesitas adaptar este flujo a tu organizacion.

