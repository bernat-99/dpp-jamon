# Despliegue unificado (resolver + visor)

## 1. Preparar el build del frontend

```bash
npm run build:frontend
```

Se genera `frontend/dist/`, que Express servirá como estático.

## 2. Arrancar el backend/visor

```bash
npm run serve
```

Por defecto escucha en `http://localhost:3000`. Rutas relevantes:

- `/scan`, `/result`, `/audit`: SPA de producción.
- `/resolver/01/.../10/.../21/...`: resolver con verificación Dynamic vs Locked.
- `/health`: comprobación rápida.

## 3. Exponer con ngrok (acceso móvil)

En otra terminal:

```bash
ngrok http 3000
```

Ngrok mostrará una URL HTTPS pública (`https://<subdominio>.ngrok.io`). Úsala para escanear con el móvil:

- `https://<ngrok>/scan`
- `https://<ngrok>/resolver/01/<gtin>/10/<lot>/21/<serial>`

## 4. Generar el QR

Define la URL pública del resultado que quieras anclar (por ejemplo `/result?...`) y ejecuta:

```bash
set PUBLIC_DPP_URL=https://<ngrok>/result?gtin=...&lot=...&serial=...
npm run qr:generate
```

Se genera `qr.png` en la raíz del proyecto. Puedes cambiar el destino con `QR_OUTPUT`.

## 5. Comprobaciones finales

1. **PC**: `http://localhost:3000/scan` y las vistas internas funcionan con recarga.
2. **Móvil (4G/5G)**: abre `https://<ngrok>/scan` y repite el flujo.
3. **Resolver directo**: `https://<ngrok>/resolver/01/...` devuelve JSON con `verified`.
4. **IPFS**: el botón “Abrir en IPFS” apunta a `https://{gateway}/ipfs/{CID}` y muestra el manifiesto.

Cuando Dynamic y Locked apuntan al mismo CID, verás `verified: true` tanto en el JSON como en la UI.

> Desarrollo local: si quieres mantener el frontend en modo dev (Vite en http://localhost:5173) y el backend en http://localhost:3000, exporta CORS_ORIGIN=http://localhost:5173 al iniciar el backend y configura VITE_API_BASE=http://localhost:3000 en el frontend.
