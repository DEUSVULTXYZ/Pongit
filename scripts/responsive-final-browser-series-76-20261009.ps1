$ErrorActionPreference='Stop'
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
$report='artifacts/responsive-20261008-r2/final-browser-series-76.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original bounded browser series'}
$jobs=@(
 @{Run='r2final76b2';Browser='chrome';Width=1366;GameMode=0},
 @{Run='r2final76c1';Browser='msedge';Width=390;GameMode=1},
 @{Run='r2final76c2';Browser='chrome';Width=1440;GameMode=1},
 @{Run='r2final76c3';Browser='msedge';Width=1440;GameMode=1},
 @{Run='r2final76c4';Browser='chrome';Width=360;GameMode=1},
 @{Run='r2final76c5';Browser='chrome';Width=768;GameMode=1},
 @{Run='r2final76b1';Browser='msedge';Width=1440;GameMode=0}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(80)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='55c2c40';reader='cf0b458';engine='1f06d83';rpc='edc24df';passed=$false;completed=@();active=$null}
$engine=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-engines-1
if($LASTEXITCODE -ne 0 -or $engine.Trim() -ne 'sha256:9e2e9f1db2f6a195c5c715001fceffc2ba098f97abdf3cfcb824486c1e357a07'){throw 'Candidate engine is not deployed'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:f0c58c6ffc486c8ff2251f36933b71f7611bdf37c6fddeba0be84ae97ae66b90'){throw 'Candidate web is not deployed'}
$sponsor=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-sponsor-1
if($LASTEXITCODE -ne 0 -or $sponsor.Trim() -ne 'sha256:7d2175f583bc4b3947f5a8649b89dfb4b1929fb8081a087cbe54563b47d329dd'){throw 'Candidate sponsor is not deployed'}
$state.sponsor='f82eb25'
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
