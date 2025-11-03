'''
SCRIPT:  pin_manifest.ps1
DESCRIPTION: Sube un manifiesto JSON a Pinata IPFS y devuelve el CID y lo copia al portapapeles.
'''

<# 
  pin_manifest.ps1
  Uso:
    .\pin_manifest.ps1 -ManifestPath ./src/manifest_seq1.json -Name "manifest_seq1"
  Requisitos:
    backend/.env con:
      PINATA_API_KEY=...
      PINATA_API_SECRET=...
#>

param(
  [Parameter(Mandatory=$true)][string]$ManifestPath,
  [string]$Name = "manifest"
)

# --- Carga .env (API key/secret) ---
$envFile = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envFile)) { throw ".env no encontrado en $(Get-Location)" }

$envLines = Get-Content $envFile | Where-Object { $_ -match '^(PINATA_API_KEY|PINATA_API_SECRET)=' }
$PINATA_API_KEY    = ($envLines | Where-Object { $_ -like 'PINATA_API_KEY=*' }).Split('=')[1]
$PINATA_API_SECRET = ($envLines | Where-Object { $_ -like 'PINATA_API_SECRET=*' }).Split('=')[1]

if (-not $PINATA_API_KEY -or -not $PINATA_API_SECRET) {
  throw "Faltan PINATA_API_KEY o PINATA_API_SECRET en .env"
}

# --- Lee el manifiesto local ---
if (-not (Test-Path $ManifestPath)) { throw "No existe el archivo $ManifestPath" }
$manifestObj = Get-Content $ManifestPath -Raw | ConvertFrom-Json

# --- Construye el body esperado por Pinata ---
# Doc oficial: POST https://api.pinata.cloud/pinning/pinJSONToIPFS
# Cuerpo: { pinataOptions?, pinataMetadata?, pinataContent }
$body = @{
  pinataMetadata = @{
    name      = $Name
    keyvalues = @{
      piece_id = $manifestObj.scope.piece_id
      seq      = $manifestObj.seq
    }
  }
  pinataContent = $manifestObj
} | ConvertTo-Json -Depth 20

# --- Llama a la API con Invoke-RestMethod ---
$headers = @{
  "pinata_api_key"       = $PINATA_API_KEY
  "pinata_secret_api_key"= $PINATA_API_SECRET
}

$uri = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
try {
  $resp = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body -ContentType "application/json"
  # Respuesta esperada incluye IpfsHash (CID)
  if ($resp.IpfsHash) {
    Write-Host "CID:" $resp.IpfsHash
  } else {
    Write-Host "Respuesta sin IpfsHash:" ($resp | ConvertTo-Json -Depth 5)
  }
} catch {
  Write-Error "Error llamando a Pinata: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  exit 1
}

$resp.IpfsHash | Set-Clipboard
Write-Host "Copiado al portapapeles."