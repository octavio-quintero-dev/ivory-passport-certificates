// Worker entry point — Phase 3: run all sources through Crawlee with retries and
// per-source error isolation, then report a summary.

import { S3Client } from "@aws-sdk/client-s3";
import { loadConfig } from "./config.js";
import { fetchMasterList } from "./fetch.js";
import { parseMasterListFile } from "./parse.js";
import { SOURCES, type Source } from "./sources.js";
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

  const processSource = async (source: Source): Promise<SourceStats> => {
    const mlPath = await fetchMasterList(source.url);
    const certs = await parseMasterListFile(mlPath);
    const { uploaded, skipped } = await uploadCertificates(
      client,
      { bucket: cfg.S3_BUCKET, prefix: cfg.S3_PREFIX },
      certs,
    );
    return { certs: certs.length, uploaded, skipped };
  };

  const results = await runSources(SOURCES, processSource);
  console.log(formatSummary(results));

  // Fail the run only if every source failed; a partial run is still useful.
  if (results.length > 0 && results.every((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Worker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
