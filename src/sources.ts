// Master List sources. Today it's the BSI hub (aggregates ~116 countries in one
// file). Phase 4 adds one entry per ministry that BSI doesn't cover — this array
// is where they go.

export interface Source {
  /** Stable id, used as the dedupe key and in logs. */
  name: string;
  /** Direct URL to the .ml/.zip file. */
  url: string;
}

// BSI German Master List — unversioned URL always serves the latest publication.
const BSI_URL =
  process.env.BSI_MASTERLIST_URL ??
  "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.zip?__blob=publicationFile";

export const SOURCES: Source[] = [{ name: "bsi-germany", url: BSI_URL }];
