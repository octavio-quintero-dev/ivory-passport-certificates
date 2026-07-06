// Manifest: an index the consuming (passport-validation) API reads to discover
// which CSCA certificates exist per country — without listing the bucket or
// parsing every PEM. Written to <prefix>/manifest.json alongside the certs.

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { certInfo, fingerprint } from "./parse.js";
import { certKey, type S3Like } from "./upload.js";

export interface CertEntry {
  /** Object key of the PEM in the bucket. */
  key: string;
  /** SHA-256 of the DER (also the PEM's filename) — lets consumers verify integrity. */
  fingerprint: string;
  country: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
}

export interface Manifest {
  generatedAt: string;
  totalCertificates: number;
  /** Country (lowercase ISO) → its CSCA certificates. */
  countries: Record<string, CertEntry[]>;
}

export function certEntry(der: ArrayBuffer, prefix: string): CertEntry {
  const info = certInfo(der);
  return {
    key: certKey(der, prefix),
    fingerprint: fingerprint(der),
    country: info.country ?? "UNKNOWN",
    subject: info.subject,
    issuer: info.issuer,
    notBefore: info.notBefore,
    notAfter: info.notAfter,
  };
}

export function buildManifest(entries: CertEntry[]): Manifest {
  const countries: Record<string, CertEntry[]> = {};
  for (const e of entries) {
    (countries[e.country.toLowerCase()] ??= []).push(e);
  }
  // Deterministic output: sort certs within a country, and countries themselves.
  for (const list of Object.values(countries)) {
    list.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  }
  const sorted = Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b)));

  return {
    generatedAt: new Date().toISOString(),
    totalCertificates: entries.length,
    countries: sorted,
  };
}

/** Upload (overwrite) the manifest at <prefix>/manifest.json. */
export async function uploadManifest(
  client: S3Like,
  opts: { bucket: string; prefix: string },
  manifest: Manifest,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: `${opts.prefix}/manifest.json`,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    }),
  );
}
