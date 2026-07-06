// Parse an ICAO 9303 CSCA Master List.
//
// A Master List file (.ml) is a CMS SignedData (RFC 5652) whose signed content is:
//   CscaMasterList ::= SEQUENCE { version INTEGER, certList SET OF Certificate }
// So parsing is two steps: (1) unwrap the CMS to get the eContent bytes, then
// (2) walk the SET OF Certificate inside it. Both use asn1js/pkijs — no openssl
// dependency at runtime.

import { readFile } from "node:fs/promises";
import * as asn1js from "asn1js";
import { Certificate, ContentInfo, SignedData } from "pkijs";

// asn1js caps nodes at 10k by default (anti-DoS). A real Master List holds
// hundreds of certs and blows past it, so we raise the ceiling for our own
// (trusted) input. ponytail: bump this if a list ever exceeds ~600 certs.
const MAX_NODES = 1_000_000;

function fromBER(der: ArrayBuffer): asn1js.FromBerResult {
  const asn1 = asn1js.fromBER(der, { maxNodes: MAX_NODES });
  if (asn1.offset === -1) throw new Error(`ASN.1: ${asn1.result?.error ?? "invalid DER"}`);
  return asn1;
}

/** Extract the signed content (the CscaMasterList DER) from a CMS SignedData. */
export function extractMasterListContent(cmsDer: ArrayBuffer): ArrayBuffer {
  const asn1 = fromBER(cmsDer);

  const contentInfo = new ContentInfo({ schema: asn1.result });
  const signedData = new SignedData({ schema: contentInfo.content });

  const eContent = signedData.encapContentInfo.eContent;
  if (!eContent) throw new Error("CMS: SignedData has no eContent (detached signature?)");
  return octetStringBytes(eContent);
}

/** Return the DER bytes of every Certificate in a CscaMasterList content blob. */
export function parseCertificates(contentDer: ArrayBuffer): ArrayBuffer[] {
  const asn1 = fromBER(contentDer);

  // SEQUENCE { version, certList SET OF Certificate } — grab the SET.
  const seqValues = (asn1.result.valueBlock as unknown as { value: asn1js.BaseBlock[] }).value;
  const certSet = seqValues.find((b) => b instanceof asn1js.Set);
  if (!certSet) throw new Error("CscaMasterList: no SET OF Certificate found");

  const certBlocks = (certSet.valueBlock as unknown as { value: asn1js.BaseBlock[] }).value;
  return certBlocks.map((b) => b.toBER(false));
}

/** Read a .ml file from disk and return the DER of every CSCA certificate. */
export async function parseMasterListFile(path: string): Promise<ArrayBuffer[]> {
  const buf = await readFile(path);
  const cmsDer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const content = extractMasterListContent(cmsDer);
  return parseCertificates(content);
}

/** Convert a certificate's DER to PEM. */
export function toPem(der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

/** Issuing country of a certificate (subject C=), or undefined if absent. */
export function certCountry(der: ArrayBuffer): string | undefined {
  const cert = new Certificate({ schema: fromBER(der).result });
  const c = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.6"); // id-at-countryName
  return c?.value.valueBlock.value as string | undefined;
}

/** Concatenate the bytes of a (possibly constructed) OCTET STRING. */
function octetStringBytes(os: asn1js.BaseBlock): ArrayBuffer {
  const vb = os.valueBlock as unknown as { value?: asn1js.BaseBlock[]; valueHexView?: Uint8Array };
  // Primitive OCTET STRING (the common case, incl. BSI): bytes are in valueHexView.
  if (vb.valueHexView && vb.valueHexView.byteLength > 0) {
    return new Uint8Array(vb.valueHexView).buffer;
  }
  // ponytail: constructed/fragmented OCTET STRING — concat the chunk contents so
  // a chunked encoding doesn't silently truncate.
  const parts = (vb.value ?? [])
    .map((c) => (c.valueBlock as unknown as { valueHexView?: Uint8Array }).valueHexView)
    .filter((p): p is Uint8Array => !!p && p.byteLength > 0);
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out.buffer;
}
