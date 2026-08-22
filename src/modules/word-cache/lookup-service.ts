import type DialPlugin from '@/main';
import type { TranslationChain } from '@/modules/translation/translation-chain';

import { createTranslationChain } from '@/modules/translation/create-translation-chain';

import type { TranslateCache } from './translate-cache';
import type { TranslateCacheRecord } from './types';

/** Where a word lookup ended up: cache tiers, a live engine, or nothing. */
export type TranslationSource = 'current' | 'promoted' | 'engine' | 'none';

export interface TranslationOutcome {
	record: TranslateCacheRecord | null;
	source: TranslationSource;
}

/**
 * Cache-first translation lookup: month-tiered cache → cloud engine
 * chain → store the fresh result back into the cache. `chain: null`
 * means translation is disabled in settings and only the cache runs.
 */
export async function lookupTranslation(options: {
	word: string;
	cache: TranslateCache;
	chain: TranslationChain | null;
	from: string;
	to: string;
}): Promise<TranslationOutcome> {
	const hit = await options.cache.lookup(options.word, options.from, options.to);
	if (hit) {
		return {
			record: hit.record,
			source: hit.source === 'promoted' ? 'promoted' : 'current',
		};
	}
	if (!options.chain) {
		return { record: null, source: 'none' };
	}
	const translated = await options.chain.translateAndReport({
		word: options.word,
		from: options.from,
		to: options.to,
	});
	if (!translated) {
		return { record: null, source: 'none' };
	}
	const record = await options.cache.put(options.word, options.from, options.to, {
		translation: translated.result.translation,
		engine: translated.result.engine,
	});
	return { record, source: 'engine' };
}

/**
 * The lookup closure the word card uses: honors the opt-in toggle, runs
 * the cache-first pipeline, and appends a line to the query log.
 */
export function createTranslationLookup(
	plugin: DialPlugin,
): (word: string) => Promise<string | null> {
	return async (word) => {
		if (!plugin.settings.translationEnabled) return null;
		const startedAt = performance.now();
		const outcome = await lookupTranslation({
			word,
			cache: plugin.translateCache,
			chain: createTranslationChain(() => plugin.settings),
			from: plugin.settings.translationSourceLang,
			to: plugin.settings.translationTargetLang,
		});
		void plugin.queryLogger.log({
			kind: 'translation',
			word,
			engine:
				outcome.source === 'engine'
					? (outcome.record?.engine ?? 'unknown')
					: `cache-${outcome.source === 'none' ? 'miss' : outcome.source}`,
			source: outcome.source,
			ok: outcome.record !== null,
			// Only real API requests consume quota.
			chars: outcome.source === 'engine' ? word.length : 0,
			ms: Math.round(performance.now() - startedAt),
		});
		return outcome.record?.translation ?? null;
	};
}
