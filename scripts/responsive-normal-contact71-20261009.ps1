$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/normal-contact71.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original contact qualification'}
$previous=Get-Content -Raw 'artifacts/responsive-20261008-r2/final-browser-series-70.json' | ConvertFrom-Json
$audit=Get-Content -Raw 'docs/validation/responsive-probe1595-20261009.json' | ConvertFrom-Json
if($previous.web -ne '2499ce1' -or $previous.completed.Count -ne 6 -or !$previous.finishedAt -or !$audit.passed){throw 'Exact completed series and timing audit required'}
$failed='artifacts/qualification/catalogue-r2final70b2/report.json'
if((Get-FileHash $failed -Algorithm SHA256).Hash.ToLower() -ne $audit.reportSha256){throw 'Preserve the failed1595 report'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:a77553468d9ccd77922be179a4f8cce3683071d311866d2fca89aabcaf7da8cc'){throw 'Candidate web changed'}
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=(Get-Date).ToUniversalTime().AddMinutes(12).ToString('o');web='2499ce1';passed=$false;completed=@();active='r2contact71b2';retainedFailure='r2final70b2'}
foreach($done in $previous.completed){
 $path="artifacts/qualification/catalogue-$($done.run)/report.json"
 $d=Get-Content -Raw $path | ConvertFrom-Json
 if(!$d.passed -or !$d.naturalEnded){throw 'Previously passing full natural match required'}
 $state.completed+=@{run=$done.run;ref=$d.ref;reportSha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLower();reused=$true}
}
[IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
try{
 & ./scripts/integrity-browser-run-20261007.ps1 -Run r2contact71b2 -Browser chrome -Width 1366 -GameMode 0 -RestoreFrom C:/Users/wwwle/.codex/private-backups/pongit/r2final70b2.json
 if($LASTEXITCODE -ne 0){throw 'Prospective Classic contact71 failed'}
 $path='artifacts/qualification/catalogue-r2contact71b2/report.json'
 $d=Get-Content -Raw $path | ConvertFrom-Json
 $state.completed+=@{run=$d.run;ref=$d.ref;reportSha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLower();reused=$false}
 $state.passed=$true
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
}
