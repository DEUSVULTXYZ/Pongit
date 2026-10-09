$ErrorActionPreference='Stop'
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
$report='artifacts/responsive-20261008-r2/final-browser-series-52.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original bounded browser series'}
$jobs=@(
 @{Run='r2final52b1';Browser='msedge';Width=1440;GameMode=0},
 @{Run='r2final52b2';Browser='chrome';Width=1366;GameMode=0},
 @{Run='r2final52c1';Browser='chrome';Width=1440;GameMode=1},
 @{Run='r2final52c2';Browser='msedge';Width=1366;GameMode=1},
 @{Run='r2final52c3';Browser='chrome';Width=360;GameMode=1},
 @{Run='r2final52c4';Browser='msedge';Width=390;GameMode=1},
 @{Run='r2final52c5';Browser='chrome';Width=768;GameMode=1}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(80)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='67bd7aa';reader='cf0b458';engine='5f8cab3';rpc='edc24df';passed=$false;completed=@();active=$null}
$engine=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-engines-1
if($LASTEXITCODE -ne 0 -or $engine.Trim() -ne 'sha256:cacaab42f26f7d2e2b5417364c13a7e686e767c0a6ea1172a8808e1fae984934'){throw 'Candidate engine is not deployed'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:3c58df2cd92aff3f9041b6f0e52bd10f1112755c46c8543edbddc227c490af62'){throw 'Candidate web is not deployed'}
$restore=''
$failures=@()
try{
 foreach($job in $jobs){
  if((Get-Date).ToUniversalTime() -ge $deadline){throw 'Original series deadline reached'}
  $state.active=$job.Run
  [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
  if($restore){$job.RestoreFrom=$restore}
  & ./scripts/integrity-browser-run-20261007.ps1 @job
  if($LASTEXITCODE -ne 0){
   $observed=Get-Content -Raw -LiteralPath "artifacts/qualification/catalogue-$($job.Run)/report.json" | ConvertFrom-Json
   $onlyAdmission=$observed.naturalEnded -and $observed.performance.admission -eq $false -and
    $observed.performance.localInput -and $observed.performance.confirmedInput -and $observed.performance.player -and $observed.performance.spectator -and
    $observed.naturalGates.noPause -and $observed.naturalGates.noResume -and $observed.naturalGates.noResync -and $observed.naturalGates.peer -and
    $observed.naturalGates.player -and $observed.naturalGates.spectator -and $observed.naturalGates.executionClock
   if(!$onlyAdmission){throw "Browser gate failed: $($job.Run)"}
   $failures+=@{run=$job.Run;gate='admission';ms=$observed.admissionMs}
   $state.failures=$failures
  }
  $state.completed+=@{run=$job.Run;at=(Get-Date -AsUTC -Format o)}
  $restore="C:/Users/wwwle/.codex/private-backups/pongit/$($job.Run).json"
 }
 if($failures.Count){throw 'Natural scenarios completed, but admission gates failed; preserve every report'}
 $state.passed=$true
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
}
