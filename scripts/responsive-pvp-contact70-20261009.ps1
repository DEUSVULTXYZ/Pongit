$ErrorActionPreference='Stop'
$report='artifacts/responsive-20261008-r2/pvp-contact70.json'
if(Test-Path -LiteralPath $report){throw 'Preserve the original PvP qualification'}
$normal=Get-Content -Raw 'artifacts/responsive-20261008-r2/final-browser-series-70.json' | ConvertFrom-Json
if(!$normal.passed -or $normal.completed.Count -ne 7){throw 'Complete the seven normal agent browser scenarios first'}
$web=& ssh pongit docker inspect --format '{{.Image}}' pongit-arcade-five-arcade-web-1
if($LASTEXITCODE -ne 0 -or $web.Trim() -ne 'sha256:a77553468d9ccd77922be179a4f8cce3683071d311866d2fca89aabcaf7da8cc'){throw 'Candidate web changed'}
$deadline=(Get-Date).ToUniversalTime().AddMinutes(30)
$state=@{startedAt=(Get-Date -AsUTC -Format o);deadline=$deadline.ToString('o');web='2499ce1';passed=$false;completed=@();active=$null}
try{
 foreach($job in @(@{Run='r2contact70hc';Mode='classic';Browser='chrome'},@{Run='r2contact70hx';Mode='chaos';Browser='msedge'})){
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
