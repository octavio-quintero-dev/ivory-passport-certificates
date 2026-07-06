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

## Branches

- `main` — release / stable
- `dev` — integration (default branch, PRs land here)
- `feature/*` — work branches, PR against `dev`
