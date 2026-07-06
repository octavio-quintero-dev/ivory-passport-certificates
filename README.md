# ivory-passport-certificates

Worker that fetches public **CSCA Master Lists** of government certificates, extracts and normalizes the certificates to `.pem`, and uploads them to S3-compatible object storage. These certificates are consumed by the iOS clients to perform **Passive Authentication** during passport NFC reading (ICAO 9303).

It never targets ICAO servers. It uses public institutional sources, starting with the **German BSI** Master List (which aggregates the CSCA certificates of dozens of nations).

## Stack

- **TypeScript** (Node 20+)
- **Crawlee** (`CheerioCrawler`) — orchestration, retry, queue
- **openssl + pkijs** — CMS / ASN.1 parsing of the Master Lists
- **`@aws-sdk/client-s3`** — storage client (S3-compatible)
- **Hetzner** — infrastructure: a small Cloud VM runs the weekly CronJob, and **Hetzner Object Storage** (S3-compatible) holds the certificates. EU datacenters (GDPR-friendly).

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
