param([string]$SshHost = 'pongit')
$ErrorActionPreference = 'Stop'
$backupRoot = Join-Path $env:USERPROFILE '.ssh/pongit-secrets/backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$backupRoot = (Resolve-Path -LiteralPath $backupRoot).Path
# Avoid nested native-argument quotes: Windows PowerShell 5.1 strips the
# quotes around find's printf format before SSH passes it to the remote shell.
$marker = (& ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost 'find /opt/pongit/shared/backups -mindepth 2 -maxdepth 2 -name complete | sort | tail -1').Trim()
if ($LASTEXITCODE -ne 0 -or $marker -notmatch '^/opt/pongit/shared/backups/(\d{8}T\d{6}Z)/complete$') { throw 'No completed remote backup available' }
$stamp = $Matches[1]
$destination = Join-Path $backupRoot $stamp
if (!(Test-Path -LiteralPath (Join-Path $destination 'complete'))) {
  $staging = [IO.Path]::GetFullPath((Join-Path $backupRoot ($stamp + '.partial')))
  $destination = [IO.Path]::GetFullPath($destination)
  foreach ($target in @($staging, $destination)) {
    if (!$target.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected backup target' }
  }
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
  & scp -q -r -o BatchMode=yes -o ConnectTimeout=15 "${SshHost}:/opt/pongit/shared/backups/$stamp" $staging
  if ($LASTEXITCODE -ne 0) { throw 'Offsite backup transfer failed' }
  foreach ($line in Get-Content -LiteralPath (Join-Path $staging 'SHA256SUMS')) {
    if ($line -notmatch '^([a-f0-9]{64})\s+(.+)$') { throw 'Invalid backup checksum manifest' }
    $expectedHash = $Matches[1]
    $fileName = [IO.Path]::GetFileName($Matches[2])
    if ($fileName -notmatch '^pong_(relayer|indexer(_[a-z0-9]+)*)\.dump$') { throw 'Unexpected backup file' }
    if ((Get-FileHash -LiteralPath (Join-Path $staging $fileName)).Hash -ne $expectedHash) { throw 'Backup checksum mismatch' }
  }
  if (!(Test-Path -LiteralPath (Join-Path $staging 'complete'))) { throw 'Incomplete source backup' }
  Move-Item -LiteralPath $staging -Destination $destination
}
Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object { $_.Name -match '^\d{8}T\d{6}Z$' -and $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | ForEach-Object {
  $candidate = (Resolve-Path -LiteralPath $_.FullName).Path
  if (!$candidate.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected backup path' }
  Remove-Item -LiteralPath $candidate -Recurse -Force
}
"Offsite backup available: $stamp"
