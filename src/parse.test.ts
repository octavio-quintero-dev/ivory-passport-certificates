// End-to-end test of the Master List parser.
//
// We can't ship a real BSI .ml (license), so we synthesize an equivalent:
// generate 2 self-signed certs with openssl, wrap them in a CscaMasterList
// SEQUENCE { version, SET OF Certificate }, sign that as CMS SignedData, and
// assert the parser recovers both certs and their countries.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as asn1js from "asn1js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { certCountry, extractMasterListContent, parseCertificates, parseMasterListFile, toPem } from "./parse.js";

let dir: string;
let signedMl: string;
let contentDer: ArrayBuffer;

const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir });

function readDer(name: string): ArrayBuffer {
  const buf = readFileSync(join(dir, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function makeCert(prefix: string, country: string): ArrayBuffer {
  openssl("req", "-x509", "-newkey", "rsa:2048", "-keyout", `${prefix}.key`, "-out", `${prefix}.pem`,
    "-days", "2", "-nodes", "-subj", `/C=${country}/O=test/CN=csca-${country.toLowerCase()}`);
  openssl("x509", "-in", `${prefix}.pem`, "-outform", "DER", "-out", `${prefix}.der`);
  return readDer(`${prefix}.der`);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "csca-test-"));
  const certDE = makeCert("de", "DE");
  const certFR = makeCert("fr", "FR");

  // CscaMasterList ::= SEQUENCE { version INTEGER, certList SET OF Certificate }
  const masterList = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Set({ value: [asn1js.fromBER(certDE).result, asn1js.fromBER(certFR).result] }),
    ],
  });
  contentDer = masterList.toBER(false);
  writeFileSync(join(dir, "content.der"), Buffer.from(contentDer));

  // Wrap the content in a CMS SignedData, signed by one of the certs.
  signedMl = join(dir, "signed.ml");
  openssl("cms", "-sign", "-in", "content.der", "-inform", "DER", "-binary", "-nodetach",
    "-outform", "DER", "-signer", "de.pem", "-inkey", "de.key", "-out", "signed.ml");
});

afterAll(() => {
  execFileSync("rm", ["-rf", dir]);
});

describe("parseCertificates", () => {
  it("extracts every certificate from the SET OF Certificate", () => {
    const certs = parseCertificates(contentDer);
    expect(certs).toHaveLength(2);
  });

  it("reads the issuing country of each certificate", () => {
    const countries = new Set(parseCertificates(contentDer).map(certCountry));
    expect(countries).toEqual(new Set(["DE", "FR"]));
  });
});

describe("extractMasterListContent + parseMasterListFile", () => {
  it("unwraps the CMS and recovers the same certificates end-to-end", async () => {
    const certs = await parseMasterListFile(signedMl);
    expect(certs).toHaveLength(2);
    expect(new Set(certs.map(certCountry))).toEqual(new Set(["DE", "FR"]));
  });
});

describe("toPem", () => {
  it("produces a PEM openssl can parse back", () => {
    const [der] = parseCertificates(contentDer);
    const pem = toPem(der);
    writeFileSync(join(dir, "out.pem"), pem);
    // openssl exits non-zero (throws) if the PEM is malformed.
    const subject = openssl("x509", "-in", "out.pem", "-noout", "-subject").toString();
    expect(subject).toContain("CN=csca-de");
  });
});
