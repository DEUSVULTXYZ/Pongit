$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/final-browser-series-10.json'
if(Test-Path -LiteralPath $report){throw 'Preserve original series; inspect before resuming'}
$jobs=@(
 @{Run='responsive-r2-motion-degraded2';Browser='chrome';Width=390;GameMode=1;Degraded=$true},
 @{Run='responsive-r2-motion-chaos360-1';Browser='chrome';Width=360;GameMode=1},
 @{Run='responsive-r2-motion-chaos390-1';Browser='msedge';Width=390;GameMode=1},
 @{Run='responsive-r2-motion-chaos1440-1';Browser='chrome';Width=1440;GameMode=1},
 @{Run='responsive-r2-motion-chaosedge360-1';Browser='msedge';Width=360;GameMode=1},
 @{Run='responsive-r2-motion-chaoschrome390-1';Browser='chrome';Width=390;GameMode=1},
 @{Run='responsive-r2-motion-classic1366-1';Browser='msedge';Width=1366;GameMode=0},
 @{Run='responsive-r2-motion-classic360-1';Browser='chrome';Width=360;GameMode=0}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(80)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='5486a5f';passed=$false;completed=@();active=$null}
$restore=''
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
