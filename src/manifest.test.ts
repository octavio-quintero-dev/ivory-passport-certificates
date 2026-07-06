// Manifest test: build the index from real certs and verify structure + upload.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildManifest, certEntry, uploadManifest } from "./manifest.js";
import type { S3Like } from "./upload.js";

let dir: string;
let derDE: ArrayBuffer;
let derFR: ArrayBuffer;

function makeCert(prefix: string, country: string): ArrayBuffer {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", `${prefix}.key`,
    "-out", `${prefix}.pem`, "-days", "2", "-nodes", "-subj", `/C=${country}/O=bund/CN=csca-${country}`], { cwd: dir });
  execFileSync("openssl", ["x509", "-in", `${prefix}.pem`, "-outform", "DER", "-out", `${prefix}.der`], { cwd: dir });
  const buf = readFileSync(join(dir, `${prefix}.der`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "csca-manifest-"));
  derDE = makeCert("de", "DE");
  derFR = makeCert("fr", "FR");
});

afterAll(() => execFileSync("rm", ["-rf", dir]));

describe("buildManifest", () => {
  it("groups certs by country with usable metadata", () => {
    const m = buildManifest([certEntry(derDE, "csca"), certEntry(derFR, "csca")]);

    expect(m.totalCertificates).toBe(2);
    expect(Object.keys(m.countries).sort()).toEqual(["de", "fr"]);

    const de = m.countries["de"][0];
    expect(de.key).toMatch(/^csca\/de\/[0-9a-f]{64}\.pem$/);
    expect(de.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(de.subject).toContain("CN=csca-DE");
    expect(Date.parse(de.notAfter)).toBeGreaterThan(Date.now()); // valid, not expired
  });
});

describe("uploadManifest", () => {
  it("writes manifest.json under the prefix", async () => {
    const puts: { key: string; body: string }[] = [];
    const fake: S3Like = {
      async send(command) {
        if (command instanceof PutObjectCommand) {
          puts.push({ key: command.input.Key as string, body: command.input.Body as string });
        }
        return {};
      },
    };
    const m = buildManifest([certEntry(derDE, "csca")]);
    await uploadManifest(fake, { bucket: "b", prefix: "csca" }, m);

    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe("csca/manifest.json");
    expect(JSON.parse(puts[0].body).totalCertificates).toBe(1);
  });
});
