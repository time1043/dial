import type { CacheFileStore } from './file-store';

import { monthKey } from './translate-cache';

export const DEFAULT_AUDIO_CACHE_DIR = '_lib/cache/audio';

/**
 * Stable short hash for an audio file name. Word text makes a poor file
 * name (case collisions, apostrophes, length limits, illegal chars
 * across platforms), so files are addressed by hash of lang + word.
 *
 * FNV-1a 32-bit: deterministic, dependency-free, and plenty for a cache
 * key — collisions would only alias one word's audio to another.
 */
export function audioHash(word: string, lang: string): string {
	let hash = 0x811c9dc5;
	for (const ch of `${lang}:${word}`) {
		const code = ch.codePointAt(0);
		if (code === undefined) continue;
		hash ^= code;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface AudioCacheStats {
	months: { month: string; files: number; bytes: number }[];
	totalFiles: number;
}

/**
 * Month-tiered audio cache under `_lib/cache/audio/`.
 *
 * Layout: one folder per month (`2026-08/`), each holding `{hash}.mp3`
 * files. Lookups mirror the translate cache: current month first, then
 * older months newest→oldest. A hit in an older month is promoted by
 * *moving* the file into the current month folder — audio is bulk
 * binary data, so no stale duplicate is kept (unlike JSON records).
 */
export class AudioCache {
	constructor(
		private readonly store: CacheFileStore,
		private readonly dir: string = DEFAULT_AUDIO_CACHE_DIR,
		private readonly now: () => number = () => Date.now(),
	) {}

	private async listMonths(): Promise<string[]> {
		const names = await this.store.list(this.dir);
		return names
			.filter((name) => /^\d{4}-\d{2}$/.test(name))
			.sort()
			.reverse();
	}

	private filePath(month: string, hash: string): string {
		return `${this.dir}/${month}/${hash}.mp3`;
	}

	async lookup(word: string, lang: string): Promise<ArrayBuffer | null> {
		const hash = audioHash(word, lang);
		const current = monthKey(new Date(this.now()));
		const months = await this.listMonths();

		const currentPath = this.filePath(current, hash);
		if (await this.store.exists(currentPath)) {
			return this.store.readBinary(currentPath);
		}

		for (const month of months) {
			if (month === current) continue;
			const oldPath = this.filePath(month, hash);
			if (!(await this.store.exists(oldPath))) continue;

			// Promote by moving: the bytes live once, in the current month.
			await this.store.mkdir(`${this.dir}/${current}`);
			const data = await this.store.readBinary(oldPath);
			await this.store.writeBinary(currentPath, data);
			await this.store.remove(oldPath);
			return data;
		}
		return null;
	}

	async put(word: string, lang: string, data: ArrayBuffer): Promise<void> {
		const hash = audioHash(word, lang);
		const current = monthKey(new Date(this.now()));
		await this.store.mkdir(`${this.dir}/${current}`);
		await this.store.writeBinary(this.filePath(current, hash), data);
	}

	async stats(): Promise<AudioCacheStats> {
		const months = await this.listMonths();
		const perMonth: AudioCacheStats['months'] = [];
		let totalFiles = 0;

		for (const month of months) {
			const names = await this.store.list(`${this.dir}/${month}`);
			const files = names.filter((name) => name.endsWith('.mp3'));
			let bytes = 0;
			for (const name of files) {
				const data = await this.store.readBinary(
					this.filePath(month, name.replace(/\.mp3$/, '')),
				);
				bytes += data.byteLength;
			}
			perMonth.push({ month, files: files.length, bytes });
			totalFiles += files.length;
		}
		return { months: perMonth, totalFiles };
	}

	/** Delete every month folder except the current one. */
	async clearBeforeCurrentMonth(): Promise<number> {
		const current = monthKey(new Date(this.now()));
		let removed = 0;
		for (const month of await this.listMonths()) {
			if (month === current) continue;
			removed += (await this.store.list(`${this.dir}/${month}`)).length;
			await this.store.remove(`${this.dir}/${month}`);
		}
		return removed;
	}

	/** Delete the current month folder. */
	async clearCurrentMonth(): Promise<number> {
		const current = monthKey(new Date(this.now()));
		const monthDir = `${this.dir}/${current}`;
		if (!(await this.store.exists(monthDir))) return 0;
		const removed = (await this.store.list(monthDir)).length;
		await this.store.remove(monthDir);
		return removed;
	}

	async clearAll(): Promise<number> {
		let removed = 0;
		for (const month of await this.listMonths()) {
			removed += (await this.store.list(`${this.dir}/${month}`)).length;
			await this.store.remove(`${this.dir}/${month}`);
		}
		return removed;
	}
}
