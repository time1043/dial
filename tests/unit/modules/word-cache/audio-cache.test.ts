import { describe, expect, it } from 'vitest';

import { audioHash, AudioCache } from '@/modules/word-cache/audio-cache';

import { MemoryCacheFileStore } from '../../../helpers/memory-cache-store';

const JULY_TS = new Date('2026-07-15T10:00:00Z').getTime();
const AUGUST_TS = new Date('2026-08-22T10:00:00Z').getTime();

function makeCache(now: () => number) {
	const store = new MemoryCacheFileStore();
	return { store, cache: new AudioCache(store, '_lib/cache/audio', now) };
}

function bytes(text: string): ArrayBuffer {
	return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function text(data: ArrayBuffer): string {
	return new TextDecoder().decode(data);
}

describe('audioHash', () => {
	it('is deterministic and differs by language', () => {
		expect(audioHash('hello', 'en-US')).toBe(audioHash('hello', 'en-US'));
		expect(audioHash('hello', 'en-US')).not.toBe(audioHash('hello', 'en-GB'));
		expect(audioHash('hello', 'en-US')).not.toBe(audioHash('world', 'en-US'));
	});

	it('produces filesystem-safe hex names', () => {
		expect(audioHash("it's", 'en-US')).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe('AudioCache', () => {
	it('stores under the current month and hits from it', async () => {
		const { store, cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en-US', bytes('mp3-hello'));

		const hash = audioHash('hello', 'en-US');
		expect(await store.exists(`_lib/cache/audio/2026-08/${hash}.mp3`)).toBe(true);

		const hit = await cache.lookup('hello', 'en-US');
		expect(text(hit ?? bytes(''))).toBe('mp3-hello');
		expect(await cache.lookup('hello', 'en-GB')).toBeNull();
	});

	it('promotes an older-month file by moving it into the current month', async () => {
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('hello', 'en-US', bytes('mp3-old'));

		const { store, cache } = makeCache(() => AUGUST_TS);
		store.copyFrom(seed.store);

		const hit = await cache.lookup('hello', 'en-US');
		expect(text(hit ?? bytes(''))).toBe('mp3-old');

		const hash = audioHash('hello', 'en-US');
		expect(await store.exists(`_lib/cache/audio/2026-07/${hash}.mp3`)).toBe(false);
		expect(await store.exists(`_lib/cache/audio/2026-08/${hash}.mp3`)).toBe(true);
	});

	it('overwrites the cached audio for the same word and lang', async () => {
		const { cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en-US', bytes('v1'));
		await cache.put('hello', 'en-US', bytes('v2'));
		expect(text((await cache.lookup('hello', 'en-US')) ?? bytes(''))).toBe('v2');
	});

	it('clearBeforeCurrentMonth removes old month folders only', async () => {
		const seed = makeCache(() => JULY_TS);
		await seed.cache.put('old', 'en-US', bytes('a'));

		const { store, cache } = makeCache(() => AUGUST_TS);
		store.copyFrom(seed.store);
		await cache.put('new', 'en-US', bytes('b'));

		expect(await cache.clearBeforeCurrentMonth()).toBe(1);
		expect(await store.exists('_lib/cache/audio/2026-07')).toBe(false);
		expect(await cache.lookup('new', 'en-US')).not.toBeNull();
	});

	it('stats reports files per month', async () => {
		const { cache } = makeCache(() => AUGUST_TS);
		await cache.put('hello', 'en-US', bytes('x'));
		await cache.put('world', 'en-US', bytes('yy'));

		const stats = await cache.stats();
		expect(stats.totalFiles).toBe(2);
		expect(stats.months[0]).toMatchObject({ month: '2026-08', files: 2 });
		expect(stats.months[0]?.bytes).toBe(3);
	});
});
