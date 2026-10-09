$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/multiball-diagnosis78.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original multiball diagnosis'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:f0c58c6ffc486c8ff2251f36933b71f7611bdf37c6fddeba0be84ae97ae66b90'){throw 'Candidate changed'}
$first=Get-Content -Raw artifacts/qualification/catalogue-r2multi78c1/report.json | ConvertFrom-Json
if(!$first.passed -or !$first.naturalEnded){throw 'Preserve and inspect the original first match'}
$deadline=([datetime]$first.startedAt).ToUniversalTime().AddMinutes(65)
$state=@{startedAt=$first.startedAt;deadline=$deadline.ToString('o');web='55c2c40';passed=$false;qualificationPassed=$false;priorFailures=@('pvp-contact76.json','final-browser-series-76.json');completed=@();active=$null;maxGames=8;bot='ONYX';requiredFrames=60;requiredSecondBallContacts=1}
$env:PONG_CATALOGUE_RECEIPT_PROBE='read-only'
$env:PONG_CATALOGUE_NODE_DIAGNOSTICS='read-only'
$restore=''
try{
 for($index=1;$index -le 8;$index++){
  $run="r2multi78c$index"
  if($index -gt 1){
   if((Get-Date).ToUniversalTime().AddMinutes(8) -ge $deadline){throw 'Original deadline leaves insufficient match time'}
   $state.active=$run
   [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
   & ./scripts/integrity-browser-run-20261007.ps1 -Run $run -Browser $(if($index%2){'chrome'}else{'msedge'}) -Width $(if($index%2){1440}else{390}) -GameMode 1 -Bot ONYX -RestoreFrom $restore
   if($LASTEXITCODE -ne 0){throw "Natural multiball browser gate failed: $run"}
  }
  $observed=Get-Content -Raw "artifacts/qualification/catalogue-$run/report.json" | ConvertFrom-Json
  $trace=Get-Content -Raw "artifacts/qualification/catalogue-$run/sync-trace.json" | ConvertFrom-Json
  $frames=@($trace.poses | Where-Object {$_.balls.Count -gt 1}).Count
  $contacts=@($observed.collisions.bounces | Where-Object {$_.ball -ne 1}).Count+@($observed.paddleCrossings.crossings | Where-Object {$_.ball -ne 1}).Count
  $state.completed+=@{run=$run;ref=$observed.ref;multiballFrames=$frames;secondBallContacts=$contacts;at=(Get-Date -AsUTC -Format o)}
  if($frames -ge 60 -and $contacts -ge 1){$state.passed=$true;break}
  $restore="C:/Users/wwwle/.codex/private-backups/pongit/$run.json"
 }
 if(!$state.passed){throw 'Bounded natural draws did not supply multiball coverage'}
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 8))
}
