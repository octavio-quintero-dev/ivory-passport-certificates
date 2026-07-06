# CSCA Master List Scraper — Process Checklist

TypeScript batch worker: download public Master Lists → extract CSCA certificates → normalize to `.pem` → upload to Hetzner Object Storage (S3-compatible). Runs weekly via CronJob.

**Base rule:** structure grows when the second real case appears, not before. We start with 1 source (BSI).

---

## Phase 0 — Setup

- [x] Repo linked to GitHub (`main` = release, `dev` = integration/default)
- [x] `package.json` + TypeScript + `tsx` (dev) configured
- [x] Core deps: `crawlee`, `pkijs`, `@peculiar/asn1-x509`, `@aws-sdk/client-s3`, `unzipper`, `zod`
- [x] `vitest` for the parser test
- [x] `.gitignore` (node_modules, dist, tmp, .env)
- [x] `.env.example` (S3 bucket, region, endpoint, credentials)

## Phase 1 — BSI spike (the core, no Crawlee yet)

> Goal: prove openssl + pkijs is enough BEFORE committing to the framework. ~50 lines cover ~80% of countries.

- [x] `fetch.ts` — download the BSI file into a temp folder (`os.tmpdir()`), unzip if needed
- [x] `parse.ts` — unwrap the CMS SignedData (pure pkijs, no openssl runtime dep)
- [x] `parse.ts` — parse the inner `SET OF Certificate` (asn1js) → one `.pem` per certificate
- [x] **Test:** synthetic signed `.ml` (openssl-generated certs) → expected N certificates (vitest, 4 passing)
- [x] Check how many distinct countries/issuers come out of the *real* BSI file — **588 certs / 116 countries** verified live against the BSI ZIP

## Phase 2 — Storage

- [x] `upload.ts` — upload the `.pem` files to Hetzner Object Storage in a structured layout (`<prefix>/<country>/<sha256>.pem`)
- [x] Define naming convention and bucket layout (SHA-256 of cert DER = fingerprint)
- [x] Idempotency: don't re-upload unchanged files (HeadObject dedupe by fingerprint)
- [x] `config.ts` — zod-validated env (S3 creds/bucket/endpoint), fail-fast at startup
- [ ] Live upload against a real Hetzner bucket — **not yet verified** (needs credentials); logic covered by fake-S3 test

## Phase 3 — Orchestration + resilience

- [x] `main.ts` — chain fetch → parse → upload (per source)
- [x] Wrap in Crawlee (`BasicCrawler`) for retry/backoff/queue — `CheerioCrawler` deferred to Phase 4 (needed only for sources that require HTML link discovery)
- [x] A single failing source must NOT bring down the whole run — Crawlee retries then routes to `failedRequestHandler`; verified live (BSI ok + dead source isolated)
- [x] Summary logging: sources OK / failed, certificate counts (new / present)
- [x] In-memory Crawlee storage (`persistStorage: false`) — no `./storage` artifacts, clean state per run

## Phase 4 — Source expansion (only once Phase 1-3 work)

- [x] Source registry with **link discovery** (Cheerio) — a source points at a
      ministry's HTML page + a `linkPattern`; the current file URL is scraped at
      runtime. Direct-file sources just set `url`. **No file-per-ministry**: a
      source is data (url + pattern), not code, until one needs custom logic.
- [x] BSI converted to page-based resolution (survives version/URL churn that
      previously caused a 404). Verified live: landing page → versioned .zip → 588 certs.
- [x] Identify which countries BSI covers — **116 entries / ~112 real countries** incl.
      every major issuer (US GB FR DE CN JP IN BR RU …) plus authorities (EU/UN/KS).
- [x] Normalize country codes to uppercase ISO (some issuers encode lowercase).
- [x] **Conclusion:** per the hub-first strategy, the BSI hub alone meets the
      "~100 nations" target. No missing *major* nation found, so no extra ministry
      is added speculatively. The registry is ready — add a `{ name, url, linkPattern }`
      entry when a specific missing country is identified.
- [ ] (Deferred/optional) Add a national master list for any specific gap the
      product later flags — registry + orchestration already support N sources.

## Phase 5 — Automation / deploy

- [x] Prod build (`tsc`) — `dist/` excludes tests; compiled entrypoint verified runnable
- [x] Dockerfile — multi-stage `node:22-slim`, **no openssl needed** (parsing is pure JS)
- [x] `.dockerignore`
- [x] Deploy doc (`DEPLOY.md`): **Hetzner** Cloud VM + Docker + **systemd timer** weekly (scheduler is infra, NOT node-cron); k8s CronJob alternative documented
- [x] S3 client points at **Hetzner Object Storage** via `S3_ENDPOINT` (path-style auto-enabled) — config + docs done
- [x] Exit-code contract for alerting (0 = partial ok, 1 = all failed / fatal) + summary log line
- [ ] Wire actual alerts to the team's monitoring stack (infra task, outside this repo)
- [ ] Build/push the image in CI (needs registry creds; Dockerfile ready)

---

## Decisions made

- **Language:** TypeScript (matches ivory stack)
- **Scraping:** Crawlee / `CheerioCrawler` — Playwright only if a site forces it
- **No NestJS:** it's a batch worker, not a listening app
- **Parsing:** openssl (unwrap CMS) + pkijs (SET OF Certificate). This is the actual hard part
- **Infrastructure:** Hetzner (Cloud VM for the CronJob, Object Storage for the certs)
- **Scheduling:** k8s/Hetzner CronJob, not `node-cron`
- **Language of the codebase:** all comments and project docs in English

## Out of scope (do NOT do)

- ❌ Target ICAO servers (CAPTCHA + license)
- ❌ NestJS, preemptive Playwright, axios, ORM, node-cron
- ❌ Map 100 sites on day 1
