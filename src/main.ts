// Worker entry point — Phase 3: run all sources through Crawlee with retries and
// per-source error isolation, then report a summary.

import { S3Client } from "@aws-sdk/client-s3";
import { loadConfig } from "./config.js";
import { fetchMasterList } from "./fetch.js";
import { parseMasterListFile } from "./parse.js";
import { buildManifest, certEntry, uploadManifest, type CertEntry } from "./manifest.js";
import { resolveSourceUrl, SOURCES, type Source } from "./sources.js";
import { uploadCertificates } from "./upload.js";
import { formatSummary, quietCrawleeLogs, runSources, type SourceStats } from "./worker.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  quietCrawleeLogs();

  const client = new S3Client({
    region: cfg.AWS_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: Boolean(cfg.S3_ENDPOINT), // path-style for non-AWS S3 (Hetzner)
    credentials: { accessKeyId: cfg.AWS_ACCESS_KEY_ID, secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY },
  });

  // Certificates seen across all sources, aggregated into the manifest at the end.
  const entries: CertEntry[] = [];

  const processSource = async (source: Source): Promise<SourceStats> => {
    const downloadUrl = await resolveSourceUrl(source);
    const mlPath = await fetchMasterList(downloadUrl);
    const certs = await parseMasterListFile(mlPath);
    const { uploaded, skipped } = await uploadCertificates(
      client,
      { bucket: cfg.S3_BUCKET, prefix: cfg.S3_PREFIX },
      certs,
    );
    entries.push(...certs.map((der) => certEntry(der, cfg.S3_PREFIX)));
    return { certs: certs.length, uploaded, skipped };
  };

  const results = await runSources(SOURCES, processSource);
  console.log(formatSummary(results));

  // Publish the index for the consuming API. Rebuilt fresh from whatever
  // succeeded this run.
  if (entries.length > 0) {
    const manifest = buildManifest(entries);
    await uploadManifest(client, { bucket: cfg.S3_BUCKET, prefix: cfg.S3_PREFIX }, manifest);
    console.log(
      `Manifest: ${manifest.totalCertificates} certs across ${Object.keys(manifest.countries).length} countries.`,
    );
  }

  // Fail the run only if every source failed; a partial run is still useful.
  if (results.length > 0 && results.every((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Worker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
