// Worker entry point — Phase 2: fetch -> parse -> upload to object storage.
// Crawlee orchestration + multi-source resilience come in Phase 3.

import { S3Client } from "@aws-sdk/client-s3";
import { loadConfig } from "./config.js";
import { fetchMasterList } from "./fetch.js";
import { certCountry, parseMasterListFile } from "./parse.js";
import { uploadCertificates } from "./upload.js";

// BSI German Master List (verified live: 588 certs / 116 countries, May 2026).
// The unversioned URL always serves the latest publication. Override via env.
const BSI_URL =
  process.env.BSI_MASTERLIST_URL ??
  "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.zip?__blob=publicationFile";

async function main(): Promise<void> {
  const cfg = loadConfig();

  console.log(`Fetching BSI Master List: ${BSI_URL}`);
  const mlPath = await fetchMasterList(BSI_URL);

  const certs = await parseMasterListFile(mlPath);
  const countries = new Set(certs.map((der) => certCountry(der)).filter(Boolean));
  console.log(`Extracted ${certs.length} certificates from ${countries.size} countries.`);

  const client = new S3Client({
    region: cfg.AWS_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: Boolean(cfg.S3_ENDPOINT), // path-style for non-AWS S3 (Hetzner)
    credentials: { accessKeyId: cfg.AWS_ACCESS_KEY_ID, secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY },
  });

  const result = await uploadCertificates(client, { bucket: cfg.S3_BUCKET, prefix: cfg.S3_PREFIX }, certs);
  console.log(`Upload done: ${result.uploaded} new, ${result.skipped} already present.`);
}

main().catch((err) => {
  console.error("Worker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
