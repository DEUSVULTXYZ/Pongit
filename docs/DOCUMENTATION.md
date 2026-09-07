# Integrated documentation

The public handbook is served at **https://pongit.xyz/docs** by the existing web service. It does not require a GitBook account, database migration or wallet. The arcade's **Docs ↗** link opens a separate tab with `noopener`, leaving the controlling arcade tab intact.

## Authoring

Articles live in `web/content/docs/<group>/<article>.mdx`. Register their title, description, group, order, keywords and review date in `web/content/docs/catalog.ts`. The catalogue order defines the sidebar and Previous / Next sequence. Use English, exact current interface labels, and check numerical rules against the contracts before changing a guide. Mark unavailable integrations explicitly.

The template supplies the H1. Use H2/H3 headings in content and link with `/docs/group/article#section-id`. Supported custom components are `Callout`, `ContractTable` and `ArchitectureDiagram`; no imports, executable expressions, remote MDX or user-generated markup are compiled. Screenshots belong in `web/public/docs-assets` and must not expose wallet keys, credentials, private notes or operator data.

```sh
npm run docs:build
npm run docs:check
npm run typecheck
node --import tsx --test tests/docs.test.ts
```

Use Node 24 or newer. Commit generated `web/lib/docs.generated.json`, `web/content/docs/registry.generated.ts` and `web/public/search/docs-v1.json` together with the source articles. The generator rejects duplicate/unlisted routes, missing article anchors, missing local images and stale generated outputs. Both the standard application build and the Docker web build regenerate documentation before Next.js compiles the local MDX files with `@next/mdx` at the same version as Next.js.

The contract table reads an explicit allowlist from `deployments/testnet.json` and its nested legacy manifests: version, chain ID, deployment start block and named contract addresses. Never serialize an entire operator environment into documentation. Search is a local JSON index, fetched only when the reader opens the search dialog; it does not call an external search service or the game's API.

## Rendering and interaction

The docs route imports only the article renderer, navigation, local search and shared focus/scroll-lock utility. It does not import Arena, Mera, the audio engine, the relayer client or live subscriptions. Styles are scoped to `.docs-site` and `.docs-overlay`; the background is static. Headings use the self-hosted Michroma font and body copy uses the system sans-serif stack.

All 24 article routes are statically generated. Unknown article URLs return HTTP 404, not a successful fallback article. Each page has its own canonical URL and metadata. `/sitemap.xml` lists the handbook and its articles. Article footers identify their revision date and link directly to the corresponding public MDX source.

## Verification

Run service/browser integration checks in the private, resource-limited VPS sandbox described in `ops/test-sandbox.yaml`, not in local PONGIT containers or against unrelated projects.

```sh
npx playwright test tests/docs.spec.ts tests/docs-game.spec.ts
```

Set `PONG_TEST_URL` and `PONG_TEST_API` to the intended environment; `CHROME_PATH` can select a compatible Chrome or Edge executable. The documentation suite verifies six viewports, all articles/anchors/assets, real 404s, canonical URLs, the sitemap, keyboard search, focus return, reduced motion, mobile overflow, and the absence of business requests/media on direct documentation visits. The game integration test uses three virtual PRF accounts, preserves an active session across a documentation tab, opens an actual spectator bet review without submitting a purchase, and confirms a game result. It does not claim physical passkey-provider coverage.

Visually inspect desktop/mobile captures as well as automated assertions. Recheck financial and authentication prose when those implementations change; successful link validation alone cannot prove that a guide is accurate.

## Deployment and rollback

This is a web/documentation change with no contract or database migration. Before release, run the existing private backup procedure and retain the current production web/relayer image digests under dedicated rollback tags. Publish only reviewed tracked files; do not include local operator archives, `.env` files, browser traces or private work notes.

Build the normal release, let active games finish before the standard activation step, then verify `/`, `/docs`, a nested article, `/sitemap.xml` and a deliberately invalid docs URL over HTTPS. The existing `ops/rollback-v4.sh` procedure can return the whole application to its previous compatible release. A rollback predating the handbook removes `/docs` until the documentation release is restored; it does not alter player funds, grants, ratings or retained replays.
