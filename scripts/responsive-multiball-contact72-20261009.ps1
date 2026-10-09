$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/multiball-contact72.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original multiball qualification'}
$normal=Get-Content -Raw 'artifacts/responsive-20261008-r2/final-browser-series-72.json' | ConvertFrom-Json
$human=Get-Content -Raw 'artifacts/responsive-20261008-r2/pvp-contact72.json' | ConvertFrom-Json
if(!$normal.passed -or !$human.passed){throw 'Complete the normal agent and human browser series first'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:ec309447cf7503fdbc020e4b0c2f0c2f7925c849ca04f645a15e4d7cc4a4a2c5'){throw 'Candidate web changed'}
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
$deadline=(Get-Date).ToUniversalTime().AddMinutes(65)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='5b9e6e4';passed=$false;completed=@();active=$null;maxGames=8;requiredFrames=60;requiredSecondBallContacts=1}
$restore=''
try{
 for($index=1;$index -le 8;$index++){
  if((Get-Date).ToUniversalTime().AddMinutes(8) -ge $deadline){throw 'Original multiball deadline leaves insufficient match time'}
  $run="r2multi72c$index"
  $state.active=$run
  [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
  $job=@{Run=$run;Browser=$(if($index%2){'chrome'}else{'msedge'});Width=$(if($index%2){1440}else{390});GameMode=1}
  if($restore){$job.RestoreFrom=$restore}
  # Natural public draws only. Do not force an effect or concede a match.
  & ./scripts/integrity-browser-run-20261007.ps1 @job
  if($LASTEXITCODE -ne 0){throw "Natural multiball browser gate failed: $run"}
  $observed=Get-Content -Raw "artifacts/qualification/catalogue-$run/report.json" | ConvertFrom-Json
  $trace=Get-Content -Raw "artifacts/qualification/catalogue-$run/sync-trace.json" | ConvertFrom-Json
  $frames=@($trace.poses | Where-Object {$_.balls.Count -gt 1}).Count
  $secondContacts=@($observed.collisions.bounces | Where-Object {$_.ball -ne 1}).Count + @($observed.paddleCrossings.crossings | Where-Object {$_.ball -ne 1}).Count
  $state.completed+=@{run=$run;ref=$observed.ref;multiballFrames=$frames;secondBallContacts=$secondContacts;at=(Get-Date -AsUTC -Format o)}
  if($frames -ge 60 -and $secondContacts -ge 1){$state.passed=$true;break}
  $restore="C:/Users/wwwle/.codex/private-backups/pongit/$run.json"
 }
 if(!$state.passed){throw 'Bounded natural draws did not supply the required multiball coverage'}
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
}
