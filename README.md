# ivory-passport-certificates

Worker that fetches public **CSCA Master Lists** of government certificates, extracts and normalizes the certificates to `.pem`, and uploads them to S3-compatible object storage. These certificates are consumed by the iOS clients to perform **Passive Authentication** during passport NFC reading (ICAO 9303).

It never targets ICAO servers. It uses public institutional sources, starting with the **German BSI** Master List (which aggregates the CSCA certificates of dozens of nations).

## Stack

- **TypeScript** (Node 20+)
- **Crawlee** (`BasicCrawler`) — orchestration, retry/backoff, per-source failure isolation; **Cheerio** for discovering download links on ministry pages
- **pkijs / asn1js** — CMS / ASN.1 parsing of the Master Lists (pure JS, no openssl at runtime)
- **`@aws-sdk/client-s3`** — storage client (works against any S3-compatible endpoint)
- **Hetzner** — infrastructure: a small Cloud VM runs the weekly job, and **Hetzner Object Storage** (S3-compatible) holds the certificates. EU datacenters (GDPR-friendly).

## Quickstart

Prerequisites: Node 20+, and S3-compatible object-storage credentials (from
Hetzner — ask whoever owns the storage account).

```bash
npm ci                     # install dependencies
npm test                   # 14 tests, no credentials needed

cp .env.example .env       # then fill in the S3_* values (see below)
npm run dev                # run the worker once: fetch → parse → upload
```

`.env` is gitignored — **never commit credentials.** Fill it with the values
your storage account issues:

```
S3_ENDPOINT=https://fsn1.your-objectstorage.com   # points the client at Hetzner
S3_REGION=fsn1
S3_ACCESS_KEY_ID=<from Hetzner>
S3_SECRET_ACCESS_KEY=<from Hetzner>
S3_BUCKET=ivory-csca-certificates                 # create this bucket once, first
S3_PREFIX=csca
```

No S3 account yet? You can still run everything except the upload — `npm test`
and the fetch/parse pipeline work offline. For a full local run without Hetzner,
point `S3_ENDPOINT` at a local [MinIO](https://min.io) container (S3-compatible).

Docker and weekly scheduling: see [DEPLOY.md](./DEPLOY.md).

## Status

See [CHECKLIST.md](./CHECKLIST.md) for the process and progress.

## Consuming the certificates

The bucket is **private read** — the certificates are public data, but access is
credentialed to control who pulls (egress/abuse) and, above all, to keep **write**
locked to this worker (a poisoned CSCA would defeat passport validation). The
consuming passport-validation API uses **read-only** S3 credentials.

Layout:

```
csca/manifest.json                 # index: every cert, grouped by country, with metadata
csca/<country>/<sha256>.pem        # one PEM per CSCA cert; filename = its SHA-256 fingerprint
```

Consumer flow (validating, e.g., a German passport):

```ts
// 1. One GET for the index — no need to list the bucket or parse PEMs
const manifest = JSON.parse(await getObject("csca/manifest.json"));

// 2. Pick the country's still-valid CSCA certs
const now = new Date().toISOString();
const certs = manifest.countries["de"].filter((c) => c.notAfter > now);

// 3. Fetch just those PEMs (verify integrity: sha256(pem) === fingerprint)
const anchors = await Promise.all(certs.map((c) => getObject(c.key)));

// 4. Verify the passport chain against them: CSCA → DSC → SOD
```

Each `manifest.json` entry: `{ key, fingerprint, country, subject, issuer, notBefore, notAfter }`.

## Branches

- `main` — release / stable
- `dev` — integration (default branch, PRs land here)
- `feature/*` — work branches, PR against `dev`
