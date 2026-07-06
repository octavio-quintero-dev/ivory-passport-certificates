// Master List sources.
//
// A source is data, not code — a name plus where to get the file. Most ministries
// publish an HTML page that links to the actual .zip/.ml (the direct URL is
// versioned and changes), so a source can point at that page and give a pattern
// to find the download link (resolved with Cheerio). Direct-file sources just set
// `url` and omit `linkPattern`.
//
// This registry is where new ministries are added. No file-per-ministry until one
// needs genuinely custom code rather than a URL + pattern.

import { load } from "cheerio";
import { httpGet } from "./http.js";

export interface Source {
  /** Stable id, used as the dedupe key and in logs. */
  name: string;
  /** Direct file URL, or — when `linkPattern` is set — the HTML page to scrape. */
  url: string;
  /** If set, `url` is a page; find the <a href> matching this and download that. */
  linkPattern?: RegExp;
}

export const SOURCES: Source[] = [
  {
    // BSI hub — aggregates ~116 countries. Resolve the current .zip from the
    // stable landing page instead of hardcoding a versioned file URL.
    name: "bsi-germany",
    url:
      process.env.BSI_MASTERLIST_URL ??
      "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/ElekAusweise/CSCA/GermanMasterList.html",
    linkPattern: /GermanMasterList\.zip/i,
  },
];

/** Find the first <a href> matching `pattern`, resolved to an absolute URL. */
export function extractLink(html: string, baseUrl: string, pattern: RegExp): string {
  const $ = load(html);
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (href && pattern.test(href)) return new URL(href, baseUrl).toString();
  }
  throw new Error(`No link matching ${pattern} on ${baseUrl}`);
}

/** Resolve a source to a direct download URL (scraping its page if needed). */
export async function resolveSourceUrl(source: Source): Promise<string> {
  if (!source.linkPattern) return source.url;
  const html = await (await httpGet(source.url)).text();
  return extractLink(html, source.url, source.linkPattern);
}
