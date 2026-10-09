$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/final-browser-faults-56.json'
if(Test-Path -LiteralPath $report){throw 'Preserve original series; inspect before resuming'}
$jobs=@(
 @{Run='r2final56f5';Browser='chrome';Width=1440;GameMode=1;Fault='f5'},
 @{Run='r2final56disconnect';Browser='msedge';Width=390;GameMode=1;Fault='disconnect'},
 @{Run='r2final56lostreply';Browser='chrome';Width=1440;GameMode=1;Fault='lost-reply'},
 @{Run='r2final56revoke';Browser='msedge';Width=1366;GameMode=1;Fault='revoke'}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(40)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='1c6dd1d';engine='1f06d83';passed=$false;completed=@();active=$null}
$normal=Get-Content -Raw -LiteralPath 'artifacts/responsive-20261008-r2/final-browser-series-56.json' | ConvertFrom-Json
if(!$normal.passed){throw 'Normal browser series must pass first'}
$restore='C:/Users/wwwle/.codex/private-backups/pongit/r2final56c5.json'
try{
 foreach($job in $jobs){
  if((Get-Date).ToUniversalTime() -ge $deadline){throw 'Original series deadline reached'}
  $state.active=$job.Run
  [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
  if($restore){$job.RestoreFrom=$restore}
  & ./scripts/integrity-browser-run-20261007.ps1 @job
  if($LASTEXITCODE -ne 0){throw "Browser gate failed: $($job.Run)"}
  $state.completed+=@{run=$job.Run;at=(Get-Date -AsUTC -Format o)}
  $restore="C:/Users/wwwle/.codex/private-backups/pongit/$($job.Run).json"
 }
 $state.passed=$true
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
}
