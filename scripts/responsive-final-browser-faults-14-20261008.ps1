$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/final-browser-faults-14.json'
if(Test-Path -LiteralPath $report){throw 'Preserve original series; inspect before resuming'}
$jobs=@(
 @{Run='responsive-r2-motion-f5-1';Browser='chrome';Width=1440;GameMode=1;Fault='f5'},
 @{Run='responsive-r2-motion-disconnect-1';Browser='msedge';Width=390;GameMode=1;Fault='disconnect'}
)
$deadline=(Get-Date).ToUniversalTime().AddMinutes(25)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='5486a5f';passed=$false;completed=@();active=$null}
$restore='C:/Users/wwwle/.codex/private-backups/pongit/responsive-r2-motion-classic360-2.json'
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
