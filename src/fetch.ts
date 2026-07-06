// Download a Master List and get a local .ml path to parse.
//
// BSI (and most ministries) publish the list as a ZIP that contains the .ml.
// A few expose the .ml/.cer/.pem directly. This handles both.

import { createWriteStream } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Open } from "unzipper";

const ML_EXTENSIONS = [".ml", ".cer", ".pem", ".der"];

/** Download `url` into a fresh temp dir and return the local file path. */
export async function downloadToTemp(url: string, filename: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);

  const dir = await mkdtemp(join(tmpdir(), "csca-"));
  const dest = join(dir, filename);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
  return dest;
}

/** Extract the first Master List entry from a ZIP; return its local path. */
export async function extractMasterList(zipPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "csca-zip-"));
  const directory = await Open.file(zipPath);
  await directory.extract({ path: dir });

  const files = await readdir(dir);
  const match = files.find((f) => ML_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)));
  if (!match) throw new Error(`No master list file (${ML_EXTENSIONS.join("/")}) inside ${zipPath}`);
  return join(dir, match);
}

/** Fetch a source URL and return a local .ml path, unzipping if needed. */
export async function fetchMasterList(url: string): Promise<string> {
  const isZip = url.toLowerCase().includes(".zip");
  const local = await downloadToTemp(url, isZip ? "masterlist.zip" : "masterlist.ml");
  return isZip ? extractMasterList(local) : local;
}
