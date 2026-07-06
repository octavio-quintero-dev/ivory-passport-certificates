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

- [ ] `fetch.ts` — GET the BSI `.ml` into a temp folder (`os.tmpdir()`)
- [ ] `parse.ts` — unwrap the CMS SignedData (openssl `cms -verify -noverify -inform DER`)
- [ ] `parse.ts` — parse the inner `SET OF Certificate` (pkijs) → one `.pem` per certificate
- [ ] **Test:** fixture `.ml` → expected N certificates (vitest)
- [ ] Check how many distinct countries/issuers come out of the BSI file

## Phase 2 — Storage

- [ ] `upload.ts` — upload the `.pem` files to Hetzner Object Storage in a structured layout (e.g. `csca/<country>/<fingerprint>.pem`)
- [ ] Define naming convention and bucket layout
- [ ] Idempotency: don't re-upload unchanged files (dedupe by fingerprint)

## Phase 3 — Orchestration + resilience

- [ ] `main.ts` — chain fetch → parse → upload
- [ ] Wrap in Crawlee (`CheerioCrawler`) for retry/backoff/queue
- [ ] A single failing source must NOT bring down the whole run (isolate errors per source)
- [ ] Summary logging: sources OK / failed, certificates new / updated

## Phase 4 — Source expansion (only once Phase 1-3 work)

- [ ] `src/sources/` is born, one file per ministry (`bsi.ts` first)
- [ ] Identify which countries BSI does NOT cover
- [ ] Add 2-4 national master lists that also aggregate (cover almost all the rest)
- [ ] A handful of individual sources for whatever is left, up to ~100

## Phase 5 — Automation / deploy

- [ ] Prod build (`tsc`)
- [ ] Dockerfile (include `openssl` in the image)
- [ ] Deploy on **Hetzner**: Cloud VM + weekly CronJob (the scheduler is infra, NOT node-cron inside the process)
- [ ] Point the S3 client at **Hetzner Object Storage** (custom `endpoint`, S3-compatible)
- [ ] Alerts if the run fails or a key source stays offline for N weeks

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
