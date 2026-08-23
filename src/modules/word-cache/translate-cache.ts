import type { CacheFileStore } from './file-store';
import type { LookupSource, TranslateCacheRecord } from './types';

export const DEFAULT_TRANSLATE_CACHE_DIR = '_lib/cache/translate';

/** `2026-08` for the given date — one cache file per month. */
export function monthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Cache key: direction + word, so `en>zh|hello` never collides with `fr>en|hello`. */
export function translateCacheKey(word: string, from: string, to: string): string {
	return `${from}>${to}|${word}`;
}

/**
 * The copy that enters the current month when an older record is
 * promoted: fresh lastSeen, +1 lookupCount, stale flag dropped, and
 * firstSeen preserved so the word's history survives cleanup.
 */
export function promoteRecord(record: TranslateCacheRecord, now: number): TranslateCacheRecord {
	return {
		...record,
		lastSeen: now,
		lookupCount: record.lookupCount + 1,
		stale: undefined,
	};
}

export interface TranslateCacheHit {
	record: TranslateCacheRecord;
	source: LookupSource;
}

export interface TranslateCacheStats {
	months: { month: string; entries: number; stale: number; bytes: number }[];
	totalEntries: number;
	totalStale: number;
}

/**
 * Month-tiered translation cache under `_lib/cache/translate/`.
 *
 * Layout: one JSON file per month (`2026-08.json`), each a map of
 * cache key → {@link TranslateCacheRecord}. Lookups check the current
 * month first, then walk older months newest→oldest. A hit in an older
 * month is *promoted*: a fresh copy lands in the current month and the
 * old one is marked `stale` but kept — stale records are the first
 * victims of cleanup because their data lives on in a newer month.
 */
export class TranslateCache {
	constructor(
		private readonly store: CacheFileStore,
		private readonly dir: string = DEFAULT_TRANSLATE_CACHE_DIR,
		private readonly now: () => number = () => Date.now(),
	) {}

	/** Month file names present on disk, newest first. */
	private async listMonths(): Promise<string[]> {
		const names = await this.store.list(this.dir);
		return names
			.filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
			.sort()
			.reverse();
	}

	private monthPath(month: string): string {
		return `${this.dir}/${month}.json`;
	}

	/** Reads a month file; missing or corrupt files read as empty. */
	private async readMonth(month: string): Promise<Record<string, TranslateCacheRecord>> {
		const path = this.monthPath(month);
		if (!(await this.store.exists(path))) return {};
		try {
			return JSON.parse(await this.store.read(path)) as Record<string, TranslateCacheRecord>;
		} catch {
			return {};
		}
	}

	private async writeMonth(
		month: string,
		data: Record<string, TranslateCacheRecord>,
	): Promise<void> {
		await this.store.mkdir(this.dir);
		await this.store.write(this.monthPath(month), JSON.stringify(data, null, '\t'));
	}

	async lookup(word: string, from: string, to: string): Promise<TranslateCacheHit | null> {
		const key = translateCacheKey(word, from, to);
		const current = monthKey(new Date(this.now()));
		const months = await this.listMonths();

		const currentData = await this.readMonth(current);
		const hit = currentData[key];
		if (hit && !hit.stale) {
			return { record: hit, source: 'current' };
		}

		for (const monthFile of months) {
			const month = monthFile.replace(/\.json$/, '');
			if (month === current) continue;
			const data = await this.readMonth(month);
			const old = data[key];
			if (!old || old.stale) continue;

			// Promote: fresh copy into the current month, stale mark on the old one.
			const promoted = promoteRecord(old, this.now());
			currentData[key] = promoted;
			await this.writeMonth(current, currentData);
			data[key] = { ...old, stale: true };
			await this.writeMonth(month, data);
			return { record: promoted, source: 'promoted' };
		}
		return null;
	}

	/** Store (or refresh) a fresh translation in the current month. */
	async put(
		word: string,
		from: string,
		to: string,
		entry: { translation: string; phonetic?: string; engine: string },
	): Promise<TranslateCacheRecord> {
		const key = translateCacheKey(word, from, to);
		const current = monthKey(new Date(this.now()));
		const data = await this.readMonth(current);
		const now = this.now();
		const existing = data[key];

		const record: TranslateCacheRecord = {
			translation: entry.translation,
			phonetic: entry.phonetic,
			from,
			to,
			engine: entry.engine,
			firstSeen: existing?.firstSeen ?? now,
			lastSeen: now,
			lookupCount: (existing?.lookupCount ?? 0) + 1,
		};
		data[key] = record;
		await this.writeMonth(current, data);
		return record;
	}

	async stats(): Promise<TranslateCacheStats> {
		const months = await this.listMonths();
		const perMonth: TranslateCacheStats['months'] = [];
		let totalEntries = 0;
		let totalStale = 0;

		for (const monthFile of months) {
			const month = monthFile.replace(/\.json$/, '');
			const data = await this.readMonth(month);
			const entries = Object.keys(data).length;
			const stale = Object.values(data).filter((record) => record.stale).length;
			const bytes = (await this.store.exists(this.monthPath(month)))
				? (await this.store.read(this.monthPath(month))).length
				: 0;
			perMonth.push({ month, entries, stale, bytes });
			totalEntries += entries;
			totalStale += stale;
		}
		return { months: perMonth, totalEntries, totalStale };
	}

	/** Remove stale records across all months (safe: data lives in a newer month). */
	async clearStale(): Promise<number> {
		let removed = 0;
		for (const monthFile of await this.listMonths()) {
			const month = monthFile.replace(/\.json$/, '');
			const data = await this.readMonth(month);
			const keys = Object.keys(data).filter((key) => data[key]?.stale);
			if (keys.length === 0) continue;
			for (const key of keys) delete data[key];
			removed += keys.length;
			await this.writeMonth(month, data);
		}
		return removed;
	}

	/** Delete every month file except the current one. Danger: loses history. */
	async clearBeforeCurrentMonth(): Promise<number> {
		const current = monthKey(new Date(this.now()));
		let removed = 0;
		for (const monthFile of await this.listMonths()) {
			const month = monthFile.replace(/\.json$/, '');
			if (month === current) continue;
			const data = await this.readMonth(month);
			removed += Object.keys(data).length;
			await this.store.remove(this.monthPath(month));
		}
		return removed;
	}

	/** Delete the current month file. Danger: loses this month's history. */
	async clearCurrentMonth(): Promise<number> {
		const current = monthKey(new Date(this.now()));
		const data = await this.readMonth(current);
		const count = Object.keys(data).length;
		await this.store.remove(this.monthPath(current));
		return count;
	}

	async clearAll(): Promise<number> {
		let removed = 0;
		for (const monthFile of await this.listMonths()) {
			const month = monthFile.replace(/\.json$/, '');
			const data = await this.readMonth(month);
			removed += Object.keys(data).length;
			await this.store.remove(this.monthPath(month));
		}
		return removed;
	}
}
