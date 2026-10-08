param([Parameter(Mandatory=$true)][ValidateSet('backup-preparation','backup-drained','backup-migrated','backup-contact-2','backup-wall-3','backup-events-4','backup-replay-5')][string]$Label,
 [ValidateSet('original','r2')][string]$Attempt='original')
$ErrorActionPreference='Stop'
$suffix=$(if($Attempt -eq 'r2'){'-r2'}else{''})
$remote='/opt/pongit/releases/responsive-20261008'+$suffix+'/'+$Label
$base='C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008'+$suffix
$dest=Join-Path $base $Label
if(Test-Path -LiteralPath $dest){throw 'Preserve previous copy; inspect it before retrying'}
New-Item -ItemType Directory -Path $dest | Out-Null
& scp ('pongit:'+$remote+'/manifest.json') (Join-Path $dest 'manifest.json')
if($LASTEXITCODE -ne 0){throw 'Manifest transfer failed'}
$manifestPath=Join-Path $dest 'manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$allowed=@('human.dump','operator.dump','agents.dump','previous-agents.dump','shared-index.dump','configuration.private.tar.gz')
$total=0L
foreach($row in $manifest.PSObject.Properties){
 if($row.Name -notin $allowed){throw 'Unexpected backup filename'}
 $path=Join-Path $dest $row.Name
 & scp ('pongit:'+$remote+'/'+$row.Name) $path
 if($LASTEXITCODE -ne 0){throw 'Backup transfer failed; partial copy preserved'}
 if((Get-Item -LiteralPath $path).Length -ne $row.Value.bytes){throw 'Backup size mismatch'}
 if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.Value.sha256){throw 'Backup SHA mismatch'}
 $total+=(Get-Item -LiteralPath $path).Length
}
if(@($manifest.PSObject.Properties).Count -ne 6){throw 'Expected five databases and runtime archive'}
$proof=@{verified=$true;at=(Get-Date -AsUTC -Format o);files=6;bytes=$total;manifestSha256=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()}
$proofPath=Join-Path $dest 'off-vps.json'
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json))
& scp $proofPath ('pongit:'+$remote+'/off-vps.json')
if($LASTEXITCODE -ne 0){throw 'Off-VPS proof upload failed'}
$proof | ConvertTo-Json -Compress
