param(
 [Parameter(Mandatory=$true)][string]$Run,
 [ValidateSet('chrome','msedge')][string]$Browser='chrome',
 [ValidateSet(0,1)][int]$GameMode=1,
 [ValidateSet(360,390,768,1366,1440)][int]$Width=1440,
 [ValidateSet('','f5','disconnect','lost-reply','revoke','unavailable-prf','background','render-stall','settled-read')][string]$Fault='',
 [switch]$Degraded,
 [switch]$HttpOnly,
 [switch]$NoVideo,
 [string]$RestoreFrom=''
)
$ErrorActionPreference='Stop'
if($Run -notmatch '^[a-z0-9-]+$'){throw 'Invalid run name'}
$env:PONG_CATALOGUE_MATCH='authorized-testnet'
$env:PONG_CATALOGUE_RUN=$Run
$env:PONG_CATALOGUE_MODE=[string]$GameMode
$env:PONG_CATALOGUE_BOT='NOVA'
$env:PONG_BROWSER_PRIVATE_PATH="C:/Users/wwwle/.codex/private-backups/pongit/$Run.json"
$env:BROWSER_CHANNEL=$Browser
$env:PONG_CATALOGUE_VISIBLE='1'
$env:PONG_CATALOGUE_NATURAL='1'
$env:PONG_CATALOGUE_SYNCHRONIZATION='rules17-public'
$env:PONG_CATALOGUE_INPUT_INTEGRITY='1'
$env:PONG_CATALOGUE_INITIAL_IDLE_MS='4000'
$env:PONG_CATALOGUE_INPUT_HOLD_MS='2000'
$env:PONG_CATALOGUE_INPUT_GAP_MS='300'
$env:PONG_SYNC_PROBE='1'
$env:PONG_SYNC_SPECTATOR='1'
$env:PONG_REQUIRE_PERFORMANCE=$(if($Fault -or $Degraded){'0'}else{'1'})
$env:PONG_REQUIRE_RECONCILIATION=$(if($Fault -or $Degraded){'0'}else{'1'})
$env:PONG_REQUIRE_NO_STARTUP_PAUSE='1'
$env:PONG_CATALOGUE_VIDEO=$(if($NoVideo){'0'}else{'1'})
$env:PONG_CATALOGUE_LOGIN_FROM_HOME=$(if($RestoreFrom){'0'}else{'1'})
if($RestoreFrom){
 if($RestoreFrom -notlike '*private-backups*' -or !(Test-Path -LiteralPath $RestoreFrom -PathType Leaf)){throw 'Existing private session required'}
 $env:PONG_CATALOGUE_RESTORE_PRIVATE_PATH=$RestoreFrom
}else{Remove-Item Env:PONG_CATALOGUE_RESTORE_PRIVATE_PATH -ErrorAction SilentlyContinue}
$env:PONG_CATALOGUE_TOUCH=$(if($Width -lt 768){'1'}else{'0'})
$env:PONG_CATALOGUE_WIDTH=[string]$Width
$env:PONG_CATALOGUE_HEIGHT=$(if($Width -eq 1366){'768'}elseif($Width -lt 768){'844'}else{'900'})
$env:PONG_CATALOGUE_HTTP_ONLY=$(if($HttpOnly -or $Degraded -or $Fault -eq 'lost-reply'){'1'}else{'0'})
$env:PONG_CATALOGUE_NETWORK_DELAY_MS=$(if($Degraded){'75'}else{'0'})
$env:PONG_CATALOGUE_NETWORK_JITTER_MS=$(if($Degraded){'25'}else{'0'})
$env:PONG_CATALOGUE_FAULT=$Fault
& 'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/tsx/dist/cli.mjs scripts/agent-catalogue-match-browser.ts
exit $LASTEXITCODE
