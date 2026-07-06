// Upload normalized certificates to S3-compatible object storage (Hetzner).
//
// Layout: <prefix>/<country>/<sha256>.pem — the SHA-256 of the cert DER is a
// stable content fingerprint, so re-runs are idempotent: an unchanged cert maps
// to the same key and is skipped.

import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { certCountry, toPem } from "./parse.js";

/** Minimal surface of S3Client we use — lets tests inject a fake. */
export interface S3Like {
  send(command: HeadObjectCommand | PutObjectCommand): Promise<unknown>;
}

export interface UploadResult {
  uploaded: number;
  skipped: number;
}

/** Object key for a certificate: <prefix>/<country>/<sha256>.pem */
export function certKey(der: ArrayBuffer, prefix: string): string {
  const country = (certCountry(der) ?? "unknown").toLowerCase();
  const fingerprint = createHash("sha256").update(Buffer.from(der)).digest("hex");
  return `${prefix}/${country}/${fingerprint}.pem`;
}

/** Upload certs, skipping any already present in the bucket. */
export async function uploadCertificates(
  client: S3Like,
  opts: { bucket: string; prefix: string },
  ders: ArrayBuffer[],
): Promise<UploadResult> {
  let uploaded = 0;
  let skipped = 0;

  for (const der of ders) {
    const key = certKey(der, opts.prefix);
    if (await objectExists(client, opts.bucket, key)) {
      skipped++;
      continue;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        Body: toPem(der),
        ContentType: "application/x-pem-file",
      }),
    );
    uploaded++;
  }

  return { uploaded, skipped };
}

async function objectExists(client: S3Like, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}
