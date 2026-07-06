// Worker entry point — Phase 1 BSI spike: fetch -> parse -> report.
// Storage upload (Phase 2) and Crawlee orchestration (Phase 3) come later.

import { fetchMasterList } from "./fetch.js";
import { certCountry, parseMasterListFile } from "./parse.js";

// BSI German Master List. The public URL changes over time — override via env.
// ponytail: default is the documented SharedDocs pattern; confirm before relying on it.
const BSI_URL =
  process.env.BSI_MASTERLIST_URL ??
  "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CSCA/GermanMasterList.zip?__blob=publicationFile";

async function main(): Promise<void> {
  console.log(`Fetching BSI Master List: ${BSI_URL}`);
  const mlPath = await fetchMasterList(BSI_URL);

  const certs = await parseMasterListFile(mlPath);
  const countries = new Set(certs.map((der) => certCountry(der)).filter(Boolean));

  console.log(`Extracted ${certs.length} certificates from ${countries.size} countries.`);
}

main().catch((err) => {
  console.error("Worker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
