# Gera o zip distribuivel do modulo.
#
# Nao use Compress-Archive: no Windows PowerShell 5.1 ele grava os separadores
# de caminho com barra invertida dentro do zip, o que viola a spec (APPNOTE 4.4.17
# exige "/"). O Windows Explorer tolera, mas o descompactador do Foundry e as
# ferramentas de Linux/Mac criam arquivos com o nome literal "pf1-bestiary\packs\...".
param(
  [string]$Origem  = "$PSScriptRoot\build\pf1-bestiary",
  [string]$Destino = "$PSScriptRoot\dist\pf1-bestiary-{0}.zip"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$versao = (Get-Content (Join-Path $Origem "module.json") -Raw | ConvertFrom-Json).version
$zipPath = $Destino -f $versao
$raiz = Split-Path $Origem -Leaf

New-Item -ItemType Directory -Force -Path (Split-Path $zipPath) | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# LOCK / LOG sao artefatos de runtime do LevelDB: o Foundry recria.
$ignorar = @('LOCK', 'LOG', 'LOG.old')

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  $n = 0
  foreach ($f in Get-ChildItem $Origem -Recurse -File) {
    if ($ignorar -contains $f.Name) { continue }
    $rel = $f.FullName.Substring($Origem.Length).TrimStart([char]92)
    $entrada = "$raiz/" + $rel.Replace([char]92, '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, $entrada, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    $n++
  }
  Write-Host "$n arquivos"
} finally { $zip.Dispose() }

# Confere que nenhuma entrada ficou com barra invertida.
$z = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$ruins = @($z.Entries | Where-Object { $_.FullName.Contains([char]92) })
$total = $z.Entries.Count
$z.Dispose()

Write-Host ("{0} -> {1:N1} MB, {2} entradas, {3} com barra invertida" -f `
  (Split-Path $zipPath -Leaf), ((Get-Item $zipPath).Length / 1MB), $total, $ruins.Count)
if ($ruins.Count) { throw "zip invalido: entradas com barra invertida" }
