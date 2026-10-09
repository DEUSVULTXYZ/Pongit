$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/pvp-contact76.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original PvP qualification'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:f0c58c6ffc486c8ff2251f36933b71f7611bdf37c6fddeba0be84ae97ae66b90'){throw 'Candidate web changed'}
$deadline=(Get-Date).ToUniversalTime().AddMinutes(30)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='55c2c40';passed=$false;completed=@();active=$null}
try{
 foreach($job in @(@{Run='r2contact76hc';Mode='classic';Browser='chrome'},@{Run='r2contact76hx';Mode='chaos';Browser='msedge'})){
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
