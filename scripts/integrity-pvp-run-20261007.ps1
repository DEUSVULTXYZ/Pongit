param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]{1,16}$')][string]$Run,
 [Parameter(Mandatory=$true)][string]$Manifest,
 [ValidateSet('classic','chaos')][string]$Mode='classic',
 [ValidateSet('chrome','msedge')][string]$Browser='msedge'
)
$ErrorActionPreference='Stop'
$manifestPath=(Resolve-Path -LiteralPath $Manifest).Path
$candidate=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($candidate.rulesVersion -ne 18){throw 'Actual responsive human manifest required'}
$env:ROOMS_BROWSER_TEST='isolated-vps'
$env:PONG_HUMAN_BROWSER_TARGET='public-release'
$env:PONG_HUMAN_NATURAL='1'
$env:PONG_HUMAN_INPUT_INTEGRITY='rules18'
$env:PONG_BROWSER_VISIBLE='1'
$env:PONG_BROWSER_VIDEO='1'
$env:INDEPENDENT_SCENARIO=$Mode
$env:INDEPENDENT_TEST_RUN=$Run
$env:PONG_BROWSER_PRIVATE_PATH="C:/Users/wwwle/.codex/private-backups/pongit/$Run.json"
$env:PONG_HUMAN_BROWSER_MANIFEST=$manifestPath
$env:PONG_SYNC_PROBE='1'
$env:BROWSER_CHANNEL=$Browser
& 'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/tsx/dist/cli.mjs scripts/independent-events-browser.ts
exit $LASTEXITCODE
