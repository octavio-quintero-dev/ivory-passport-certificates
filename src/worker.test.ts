// Resilience test: the whole point of Phase 3. A source that throws must not
// abort the run, and a flaky source must be retried. process() is injected, so
// no network is involved.

import { beforeAll, describe, expect, it } from "vitest";
import type { Source } from "./sources.js";
import { formatSummary, quietCrawleeLogs, runSources } from "./worker.js";

beforeAll(() => quietCrawleeLogs());

const sources: Source[] = [
  { name: "good-1", url: "https://example.test/good1" },
  { name: "bad", url: "https://example.test/bad" },
  { name: "good-2", url: "https://example.test/good2" },
];

describe("runSources", () => {
  it("isolates a failing source — the others still process", async () => {
    const processed: string[] = [];
    const results = await runSources(
      sources,
      async (s) => {
        processed.push(s.name);
        if (s.name === "bad") throw new Error("ministry offline");
        return { certs: 10, uploaded: 3, skipped: 7 };
      },
      { maxRetries: 0 },
    );

    expect(new Set(processed)).toEqual(new Set(["good-1", "bad", "good-2"]));

    const byName = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(byName["good-1"].ok).toBe(true);
    expect(byName["good-2"].ok).toBe(true);
    expect(byName["bad"].ok).toBe(false);
    expect(byName["bad"].error).toContain("ministry offline");
  });

  it("passes the real Source to process (RegExp fields survive)", async () => {
    // Regression: Crawlee JSON-serializes userData, which would turn a RegExp
    // linkPattern into {}. runSources must not route Sources through userData.
    const withPattern: Source = { name: "bsi", url: "https://example.test/p", linkPattern: /\.zip/i };
    let seen: Source | undefined;
    await runSources(
      [withPattern],
      async (s) => {
        seen = s;
        return { certs: 1, uploaded: 1, skipped: 0 };
      },
      { maxRetries: 0 },
    );
    expect(seen?.linkPattern).toBeInstanceOf(RegExp);
    expect(seen?.linkPattern?.test("a.ZIP")).toBe(true);
  });

  it("retries a flaky source before giving up", async () => {
    let attempts = 0;
    const results = await runSources(
      [{ name: "flaky", url: "https://example.test/flaky" }],
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("timeout");
        return { certs: 1, uploaded: 1, skipped: 0 };
      },
      { maxRetries: 3 },
    );

    expect(attempts).toBe(3);
    expect(results[0].ok).toBe(true);
  });
});

describe("formatSummary", () => {
  it("reports per-source status and totals", () => {
    const out = formatSummary([
      { name: "a", ok: true, certs: 100, uploaded: 5, skipped: 95 },
      { name: "b", ok: false, error: "boom" },
    ]);
    expect(out).toContain("✓ a");
    expect(out).toContain("✗ b: boom");
    expect(out).toContain("1 ok, 1 failed");
    expect(out).toContain("100 certs");
  });
});
