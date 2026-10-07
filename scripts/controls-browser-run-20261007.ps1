param([Parameter(Mandatory=$true)][string]$Run,[ValidateSet('chrome','msedge')][string]$Browser='chrome',[switch]$HomeLogin,[switch]$Touch,[switch]$Degraded,[ValidateSet(0,1)][int]$GameMode=1,[ValidateSet('','f5')][string]$Fault='')
$ErrorActionPreference='Stop'
if($Run -notmatch '^[a-z0-9-]+$'){throw 'Invalid run name'}
$env:PONG_CATALOGUE_MATCH='authorized-testnet'
$env:PONG_CATALOGUE_RUN=$Run
$env:PONG_CATALOGUE_MODE=[string]$GameMode
$env:PONG_CATALOGUE_BOT='NOVA'
$env:PONG_BROWSER_PRIVATE_PATH="C:/Users/wwwle/.codex/private-backups/pongit/$Run.json"
$env:BROWSER_CHANNEL=$Browser
$env:PONG_CATALOGUE_NATURAL='1'
$env:PONG_CATALOGUE_SYNCHRONIZATION='rules16-public'
$env:PONG_CATALOGUE_INITIAL_IDLE_MS='4000'
$env:PONG_CATALOGUE_INPUT_HOLD_MS='300'
$env:PONG_CATALOGUE_INPUT_GAP_MS='300'
$env:PONG_SYNC_PROBE='1'
$env:PONG_SYNC_SPECTATOR='1'
$env:PONG_REQUIRE_PERFORMANCE='1'
$env:PONG_CATALOGUE_VIDEO='1'
$env:PONG_CATALOGUE_LOGIN_FROM_HOME=$(if($HomeLogin){'1'}else{'0'})
$env:PONG_CATALOGUE_TOUCH=$(if($Touch){'1'}else{'0'})
$env:PONG_CATALOGUE_WIDTH=$(if($Touch){'390'}else{'1440'})
$env:PONG_CATALOGUE_HTTP_ONLY=$(if($Degraded){'1'}else{'0'})
$env:PONG_CATALOGUE_NETWORK_DELAY_MS=$(if($Degraded){'75'}else{'0'})
$env:PONG_CATALOGUE_FAULT=$Fault
& 'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/tsx/dist/cli.mjs scripts/agent-catalogue-match-browser.ts
exit $LASTEXITCODE
