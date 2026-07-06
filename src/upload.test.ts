// Upload logic test — key layout + idempotent dedupe — against an in-memory
// fake S3 client (no network). Certs are openssl-generated at setup.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { certKey, uploadCertificates, type S3Like } from "./upload.js";

let dir: string;
let derA: ArrayBuffer;
let derB: ArrayBuffer;

function makeCert(prefix: string, country: string): ArrayBuffer {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", `${prefix}.key`,
    "-out", `${prefix}.pem`, "-days", "2", "-nodes", "-subj", `/C=${country}/O=t/CN=${prefix}`], { cwd: dir });
  execFileSync("openssl", ["x509", "-in", `${prefix}.pem`, "-outform", "DER", "-out", `${prefix}.der`], { cwd: dir });
  const buf = readFileSync(join(dir, `${prefix}.der`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Fake S3: HeadObject reports presence, PutObject stores. Mirrors the AWS SDK's
// NotFound-on-missing-Head behavior our dedupe relies on.
class FakeS3 implements S3Like {
  readonly keys = new Set<string>();
  async send(command: HeadObjectCommand | PutObjectCommand): Promise<unknown> {
    const key = command.input.Key as string;
    if (command instanceof HeadObjectCommand) {
      if (this.keys.has(key)) return {};
      throw Object.assign(new Error("Not Found"), { name: "NotFound" });
    }
    if (command instanceof PutObjectCommand) {
      this.keys.add(key);
      return {};
    }
    throw new Error("unexpected command");
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "csca-upload-"));
  derA = makeCert("de", "DE");
  derB = makeCert("fr", "FR");
});

afterAll(() => execFileSync("rm", ["-rf", dir]));

describe("certKey", () => {
  it("is prefix/country/sha256.pem", () => {
    expect(certKey(derA, "csca")).toMatch(/^csca\/de\/[0-9a-f]{64}\.pem$/);
  });
});

describe("uploadCertificates", () => {
  it("uploads new certs, then skips them on re-run (dedupe by fingerprint)", async () => {
    const s3 = new FakeS3();
    const opts = { bucket: "b", prefix: "csca" };

    const first = await uploadCertificates(s3, opts, [derA, derB]);
    expect(first).toEqual({ uploaded: 2, skipped: 0 });

    const second = await uploadCertificates(s3, opts, [derA, derB]);
    expect(second).toEqual({ uploaded: 0, skipped: 2 });

    expect(s3.keys.size).toBe(2);
  });
});
