// Orchestration + resilience via Crawlee's BasicCrawler.
//
// Each source is one request. Crawlee retries a failing handler with backoff
// (maxRequestRetries) and isolates failures: a source that stays unreachable
// ends up in failedRequestHandler without stopping the others — the key
// requirement, since government sites go offline often.

import { BasicCrawler, Configuration, log, LogLevel } from "crawlee";
import type { Source } from "./sources.js";

export interface SourceStats {
  certs: number;
  uploaded: number;
  skipped: number;
}

export interface SourceResult extends Partial<SourceStats> {
  name: string;
  ok: boolean;
  error?: string;
}

/** Fetch → parse → upload for one source. Injected so it can be faked in tests. */
export type ProcessSource = (source: Source) => Promise<SourceStats>;

export async function runSources(
  sources: Source[],
  process: ProcessSource,
  opts: { maxRetries?: number } = {},
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  // Keep the rich Source objects in a closure Map, keyed by the string uniqueKey.
  // Do NOT pass them through Crawlee's userData — it JSON-serializes the request,
  // which silently destroys non-JSON fields like a RegExp linkPattern.
  const byKey = new Map(sources.map((s) => [s.name, s]));

  const crawler = new BasicCrawler(
    {
      maxRequestRetries: opts.maxRetries ?? 3,
      async requestHandler({ request }) {
        const source = byKey.get(request.uniqueKey);
        if (!source) throw new Error(`Unknown source: ${request.uniqueKey}`);
        const stats = await process(source);
        results.push({ name: source.name, ok: true, ...stats });
      },
      failedRequestHandler({ request }, error) {
        results.push({ name: request.uniqueKey, ok: false, error: error.message });
      },
    },
    // In-memory storage: no ./storage artifacts, clean state every run.
    new Configuration({ persistStorage: false }),
  );

  await crawler.addRequests(sources.map((s) => ({ url: s.url, uniqueKey: s.name })));
  await crawler.run();

  return results;
}

/** One-line-per-source summary plus totals. */
export function formatSummary(results: SourceResult[]): string {
  const lines = results.map((r) =>
    r.ok
      ? `  ✓ ${r.name}: ${r.certs} certs (${r.uploaded} new, ${r.skipped} present)`
      : `  ✗ ${r.name}: ${r.error}`,
  );
  const ok = results.filter((r) => r.ok);
  const failed = results.length - ok.length;
  const totals = ok.reduce(
    (acc, r) => ({ certs: acc.certs + (r.certs ?? 0), uploaded: acc.uploaded + (r.uploaded ?? 0) }),
    { certs: 0, uploaded: 0 },
  );
  lines.push(
    `Sources: ${ok.length} ok, ${failed} failed — ${totals.certs} certs, ${totals.uploaded} newly uploaded.`,
  );
  return lines.join("\n");
}

/** Quiet Crawlee's default chatty logging down to warnings. */
export function quietCrawleeLogs(): void {
  log.setLevel(LogLevel.WARNING);
}
