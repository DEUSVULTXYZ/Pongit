$ErrorActionPreference='Stop'
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
$report='artifacts/responsive-20261008-r2/final-browser-series-37.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original bounded browser series'}
$jobs=@(
 @{Run='r2final37c1';Browser='chrome';Width=1440;GameMode=1},
 @{Run='r2final37c2';Browser='msedge';Width=1376;GameMode=1},
 @{Run='r2final37c3';Browser='chrome';Width=370;GameMode=1},
 @{Run='r2final37c4';Browser='msedge';Width=390;GameMode=1},
 @{Run='r2final37c5';Browser='chrome';Width=768;GameMode=1},
 @{Run='r2final37b1';Browser='msedge';Width=1440;GameMode=0},
 @{Run='r2final37b2';Browser='chrome';Width=1376;GameMode=0}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(80)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='e58531d';reader='337cccc';rpc='d91efed';passed=$false;completed=@();active=$null}
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
