import type { CacheFileStore } from './file-store';

import { monthKey } from './translate-cache';

export const DEFAULT_LOGS_DIR = '_lib/logs';

export interface QueryLogEntry {
	/** ISO timestamp. */
	ts: string;
	kind: 'translation' | 'speech';
	word: string;
	/**
	 * Engine id, or a pseudo-engine describing the outcome:
	 * `cache-current` / `cache-promoted` for cache hits, `none` for
	 * failures (disabled or every engine failed).
	 */
	engine: string;
	source: 'current' | 'promoted' | 'engine' | 'none';
	ok: boolean;
	/** Characters sent to the cloud API — feeds free-quota awareness. */
	chars?: number;
	/** Wall-clock duration of the whole lookup. */
	ms?: number;
}

export interface QueryTotals {
	lookups: number;
	cacheHits: number;
	apiRequests: number;
	failed: number;
	chars: number;
}

export interface QueryAggregate {
	total: QueryTotals;
	/** Per-engine request counts (pseudo-engines included). */
	byEngine: Record<string, { count: number; chars: number }>;
	months: string[];
}

/**
 * Append-only JSONL query log under `_lib/logs/YYYY-MM.jsonl`, one file
 * per month like the caches. Every lookup appends one line via the
 * filesystem append primitive (no read-modify-write of the whole file);
 * aggregation scans the (small) files lazily when settings opens.
 */
export class QueryLogger {
	constructor(
		private readonly store: CacheFileStore,
		private readonly dir: string = DEFAULT_LOGS_DIR,
		private readonly now: () => Date = () => new Date(),
	) {}

	async log(entry: Omit<QueryLogEntry, 'ts'>): Promise<void> {
		const line: QueryLogEntry = { ...entry, ts: this.now().toISOString() };
		await this.store.mkdir(this.dir);
		await this.store.append(
			`${this.dir}/${monthKey(this.now())}.jsonl`,
			`${JSON.stringify(line)}\n`,
		);
	}

	/** Scan all month files and sum. Corrupt lines are skipped. */
	async aggregate(): Promise<QueryAggregate> {
		const total: QueryTotals = {
			lookups: 0,
			cacheHits: 0,
			apiRequests: 0,
			failed: 0,
			chars: 0,
		};
		const byEngine: QueryAggregate['byEngine'] = {};
		const months: string[] = [];

		for (const name of await this.store.list(this.dir)) {
			if (!/^\d{4}-\d{2}\.jsonl$/.test(name)) continue;
			months.push(name.replace(/\.jsonl$/, ''));
			const path = `${this.dir}/${name}`;
			if (!(await this.store.exists(path))) continue;
			let text: string;
			try {
				text = await this.store.read(path);
			} catch {
				continue;
			}
			for (const line of text.split('\n')) {
				if (!line.trim()) continue;
				let entry: QueryLogEntry;
				try {
					entry = JSON.parse(line) as QueryLogEntry;
				} catch {
					continue;
				}
				total.lookups++;
				if (entry.source === 'current' || entry.source === 'promoted') total.cacheHits++;
				if (entry.source === 'engine') total.apiRequests++;
				if (!entry.ok) total.failed++;
				total.chars += entry.chars ?? 0;
				const bucket = (byEngine[entry.engine] ??= { count: 0, chars: 0 });
				bucket.count++;
				bucket.chars += entry.chars ?? 0;
			}
		}
		return { total, byEngine, months: months.sort().reverse() };
	}

	/** Delete every month file; returns the number of log lines removed. */
	async clearAll(): Promise<number> {
		let removed = 0;
		for (const name of await this.store.list(this.dir)) {
			if (!/^\d{4}-\d{2}\.jsonl$/.test(name)) continue;
			const path = `${this.dir}/${name}`;
			if (await this.store.exists(path)) {
				try {
					removed += (await this.store.read(path))
						.split('\n')
						.filter((l) => l.trim()).length;
				} catch {
					// Unreadable file still gets removed below.
				}
			}
			await this.store.remove(path);
		}
		return removed;
	}
}
