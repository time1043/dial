import { describe, expect, it } from 'vitest';

import {
	monthKey,
	promoteRecord,
	TranslateCache,
	translateCacheKey,
} from '@/modules/word-cache/translate-cache';

import { MemoryCacheFileStore } from '../../../helpers/memory-cache-store';

const JULY_TS = new Date('2026-07-15T10:00:00Z').getTime();
const AUGUST_TS = new Date('2026-08-22T10:00:00Z').getTime();

function makeCache(now: () => number) {
	const store = new MemoryCacheFileStore();
	return { store, cache: new TranslateCache(store, '_lib/cache/translate', now) };
}

describe('monthKey / translateCacheKey', () => {
	it('formats months with zero padding', () => {
		expect(monthKey(new Date('2026-08-05T00:00:00Z'))).toBe('2026-08');
		expect(monthKey(new Date('2026-11-05T00:00:00Z'))).toBe('2026-11');
	});

	it('separates translation directions', () => {
		expect(translateCacheKey('hello', 'en', 'zh')).not.toBe(
			translateCacheKey('hello', 'fr', 'en'),
		);
	});
});

describe('promoteRecord', () => {
	it('bumps recency and count but preserves firstSeen and drops stale', () => {
		const promoted = promoteRecord(
			{
				translation: '你好',
				from: 'en',
				to: 'zh',
				engine: 'azure',
				firstSeen: 100,
				lastSeen: 200,
				lookupCount: 2,
				stale: true,
			},
			300,
		);
		expect(promoted).toMatchObject({ firstSeen: 100, lastSeen: 300, lookupCount: 3 });
		expect(promoted.stale).toBeUndefined();
	});
});

describe('TranslateCache', () => {
	it('stores into the current month file and hits as current', async () => {
		const { cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });

		const hit = await cache.lookup('hello', 'en', 'zh');
		expect(hit?.source).toBe('current');
		expect(hit?.record.translation).toBe('你好');
		expect(hit?.record.lookupCount).toBe(1);
	});

	it('misses for a different direction', async () => {
		const { cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });
		expect(await cache.lookup('hello', 'fr', 'en')).toBeNull();
	});

	it('promotes an older-month hit and marks the old record stale', async () => {
		// Seed July by running a cache whose clock is stuck in July.
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });

		// August cache over the same files.
		const { store, cache } = makeCache(() => AUGUST_TS);
		const julyFile = '_lib/cache/translate/2026-07.json';
		store.copyFrom(seed.store);
		// (the memory store exposes copyFrom for seeding between clock contexts)

		const hit = await cache.lookup('hello', 'en', 'zh');
		expect(hit?.source).toBe('promoted');
		expect(hit?.record.lookupCount).toBe(2);
		expect(hit?.record.firstSeen).toBe(JULY_TS);
		expect(hit?.record.lastSeen).toBe(AUGUST_TS);

		const july = JSON.parse(await store.read(julyFile)) as Record<string, { stale?: boolean }>;
		expect(july[translateCacheKey('hello', 'en', 'zh')]?.stale).toBe(true);

		// Second lookup hits the promoted copy in August.
		expect((await cache.lookup('hello', 'en', 'zh'))?.source).toBe('current');
	});

	it('ignores stale records in old months with no fresh copy anywhere', async () => {
		const { store, cache } = makeCache(() => AUGUST_TS);
		await store.mkdir('_lib/cache/translate');
		await store.write(
			'_lib/cache/translate/2026-07.json',
			JSON.stringify({
				[translateCacheKey('hello', 'en', 'zh')]: {
					translation: '你好',
					from: 'en',
					to: 'zh',
					engine: 'azure',
					firstSeen: 1,
					lastSeen: 1,
					lookupCount: 1,
					stale: true,
				},
			}),
		);
		expect(await cache.lookup('hello', 'en', 'zh')).toBeNull();
	});

	it('refresh keeps firstSeen and bumps lookupCount', async () => {
		const { cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });
		const record = await cache.put('hello', 'en', 'zh', {
			translation: '你好（问候）',
			engine: 'deepl',
		});
		expect(record.firstSeen).toBe(AUGUST_TS);
		expect(record.lookupCount).toBe(2);
		expect((await cache.lookup('hello', 'en', 'zh'))?.record.translation).toBe('你好（问候）');
	});

	it('treats a corrupt month file as empty instead of throwing', async () => {
		const { store, cache } = makeCache(() => AUGUST_TS);
		await store.mkdir('_lib/cache/translate');
		await store.write('_lib/cache/translate/2026-07.json', '{not json');
		expect(await cache.lookup('hello', 'en', 'zh')).toBeNull();
	});

	it('clearStale removes stale copies but keeps fresh ones', async () => {
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });
		await seed.cache.put('world', 'en', 'zh', { translation: '世界', engine: 'azure' });

		const { store, cache } = makeCache(() => AUGUST_TS);
		store.copyFrom(seed.store);
		await cache.lookup('hello', 'en', 'zh'); // promotes hello, stales the July copy

		const removed = await cache.clearStale();
		expect(removed).toBe(1);

		const july = JSON.parse(await store.read('_lib/cache/translate/2026-07.json')) as Record<
			string,
			unknown
		>;
		expect(july[translateCacheKey('hello', 'en', 'zh')]).toBeUndefined();
		expect(july[translateCacheKey('world', 'en', 'zh')]).toBeDefined();
	});

	it('clearBeforeCurrentMonth drops old month files and counts their entries', async () => {
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });

		const { store, cache } = makeCache(() => AUGUST_TS);
		store.copyFrom(seed.store);
		await cache.put('fresh', 'en', 'zh', { translation: '新', engine: 'azure' });

		const removed = await cache.clearBeforeCurrentMonth();
		expect(removed).toBe(1);
		expect(await store.exists('_lib/cache/translate/2026-07.json')).toBe(false);
		expect(await store.exists('_lib/cache/translate/2026-08.json')).toBe(true);
	});

	it('stats aggregates entries and stale counts per month', async () => {
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('hello', 'en', 'zh', { translation: '你好', engine: 'azure' });

		const { store, cache } = makeCache(() => AUGUST_TS);
		store.copyFrom(seed.store);
		await cache.lookup('hello', 'en', 'zh');

		const stats = await cache.stats();
		expect(stats.totalEntries).toBe(2); // stale July copy + fresh August copy
		expect(stats.totalStale).toBe(1);
		expect(stats.months.map((m) => m.month)).toEqual(['2026-08', '2026-07']);
	});
});
