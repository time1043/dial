import { describe, expect, it } from 'vitest';

import { QueryLogger } from '@/modules/word-cache/query-logger';

import { MemoryCacheFileStore } from '../../../helpers/memory-cache-store';

const AUGUST = new Date('2026-08-22T10:00:00Z');

describe('QueryLogger', () => {
	it('appends one JSONL line per lookup into the current month file', async () => {
		const store = new MemoryCacheFileStore();
		const logger = new QueryLogger(store, '_lib/logs', () => AUGUST);

		await logger.log({
			kind: 'translation',
			word: 'hello',
			engine: 'azure-translate',
			source: 'engine',
			ok: true,
			chars: 5,
			ms: 320,
		});
		await logger.log({
			kind: 'speech',
			word: 'hello',
			engine: 'system',
			source: 'engine',
			ok: true,
		});

		const raw = await store.read('_lib/logs/2026-08.jsonl');
		const lines = raw.split('\n').filter((l) => l.trim());
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0] ?? '')).toMatchObject({
			kind: 'translation',
			word: 'hello',
			engine: 'azure-translate',
			source: 'engine',
			ok: true,
			chars: 5,
		});
	});

	it('aggregates hits, api requests, failures, and chars across months', async () => {
		const store = new MemoryCacheFileStore();
		const logger = new QueryLogger(store, '_lib/logs', () => AUGUST);

		await logger.log({
			kind: 'translation',
			word: 'a',
			engine: 'cache-current',
			source: 'current',
			ok: true,
		});
		await logger.log({
			kind: 'translation',
			word: 'b',
			engine: 'cache-promoted',
			source: 'promoted',
			ok: true,
		});
		await logger.log({
			kind: 'translation',
			word: 'ccc',
			engine: 'deepl',
			source: 'engine',
			ok: true,
			chars: 3,
		});
		await logger.log({
			kind: 'translation',
			word: 'd',
			engine: 'none',
			source: 'none',
			ok: false,
		});

		const aggregate = await logger.aggregate();
		expect(aggregate.total).toEqual({
			lookups: 4,
			cacheHits: 2,
			apiRequests: 1,
			failed: 1,
			chars: 3,
		});
		expect(aggregate.byEngine['deepl']).toEqual({ count: 1, chars: 3 });
		expect(aggregate.byEngine['cache-current']).toEqual({ count: 1, chars: 0 });
		expect(aggregate.months).toEqual(['2026-08']);
	});

	it('skips corrupt lines instead of throwing', async () => {
		const store = new MemoryCacheFileStore();
		const logger = new QueryLogger(store, '_lib/logs', () => AUGUST);
		await logger.log({
			kind: 'speech',
			word: 'a',
			engine: 'system',
			source: 'engine',
			ok: true,
		});
		await store.append('_lib/logs/2026-08.jsonl', '{corrupt\n');

		const aggregate = await logger.aggregate();
		expect(aggregate.total.lookups).toBe(1);
	});

	it('clearAll removes the month files and reports the line count', async () => {
		const store = new MemoryCacheFileStore();
		const logger = new QueryLogger(store, '_lib/logs', () => AUGUST);
		await logger.log({
			kind: 'speech',
			word: 'a',
			engine: 'system',
			source: 'engine',
			ok: true,
		});
		await logger.log({
			kind: 'speech',
			word: 'b',
			engine: 'system',
			source: 'engine',
			ok: true,
		});

		const removed = await logger.clearAll();
		expect(removed).toBe(2);
		expect(await logger.aggregate()).toMatchObject({
			total: { lookups: 0 },
		});
	});
});
