// Link-discovery test: given a source page's HTML, find and absolutize the
// download link. No network — extractLink is pure.

import { describe, expect, it } from "vitest";
import { extractLink } from "./sources.js";

const BASE = "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.html";

describe("extractLink", () => {
  it("resolves a relative download href to an absolute URL", () => {
    const html = `
      <a href="GermanMasterList.html#nav">skip</a>
      <a href="/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.zip?__blob=publicationFile&v=108">download</a>
    `;
    expect(extractLink(html, BASE, /GermanMasterList\.zip/i)).toBe(
      "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.zip?__blob=publicationFile&v=108",
    );
  });

  it("throws when no link matches", () => {
    const html = `<a href="/other.pdf">nope</a>`;
    expect(() => extractLink(html, BASE, /MasterList\.zip/)).toThrow(/No link matching/);
  });
});
