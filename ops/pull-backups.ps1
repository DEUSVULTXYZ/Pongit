param([string]$SshHost = 'pongit')
$ErrorActionPreference = 'Stop'
$backupRoot = Join-Path $env:USERPROFILE '.ssh/pongit-secrets/backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$backupRoot = (Resolve-Path -LiteralPath $backupRoot).Path
$stamp = (& ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost 'find /opt/pongit/shared/backups -mindepth 2 -maxdepth 2 -name complete -printf "%h\n" | sort | tail -1').Trim().Split('/')[-1]
if ($LASTEXITCODE -ne 0 -or $stamp -notmatch '^\d{8}T\d{6}Z$') { throw 'No completed remote backup available' }
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
    if ($fileName -notin @('pong_relayer.dump', 'pong_indexer.dump')) { throw 'Unexpected backup file' }
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
