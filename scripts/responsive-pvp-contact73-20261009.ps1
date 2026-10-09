$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/pvp-contact73.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original PvP qualification'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:d45f3c2de3248a3702b005698ae167806e53f27e1e698bbfbc47eaa82b8f7a2c'){throw 'Candidate web changed'}
$deadline=(Get-Date).ToUniversalTime().AddMinutes(30)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='bea0e24';passed=$false;completed=@();active=$null}
try{
 foreach($job in @(@{Run='r2contact73hc';Mode='classic';Browser='chrome'},@{Run='r2contact73hx';Mode='chaos';Browser='msedge'})){
  if((Get-Date).ToUniversalTime() -ge $deadline){throw 'Original PvP deadline reached'}
  $state.active=$job.Run
  [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
  & ./scripts/integrity-pvp-run-20261007.ps1 @job -Manifest artifacts/responsive-20261008-r2/human-public-recovered.json
  if($LASTEXITCODE -ne 0){throw "Natural PvP gate failed: $($job.Run)"}
  $state.completed+=@{run=$job.Run;at=(Get-Date -AsUTC -Format o)}
 }
 $state.passed=$true
}catch{$state.error=$_.Exception.Message;throw}
finally{
 $state.finishedAt=(Get-Date -AsUTC -Format o)
 [IO.File]::WriteAllText((Join-Path (Get-Location) $report),($state | ConvertTo-Json -Depth 6))
}
