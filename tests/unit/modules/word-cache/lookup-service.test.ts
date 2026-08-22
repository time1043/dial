import { describe, expect, it, vi } from 'vitest';

import type { SynthesizingSpeechProvider } from '@/modules/speech/speech-provider';
import type { TranslationProvider } from '@/modules/translation/translation-provider';

import { CachedSpeechProvider } from '@/modules/speech/cached-speech-provider';
import { TranslationChain } from '@/modules/translation/translation-chain';
import { AudioCache } from '@/modules/word-cache/audio-cache';
import { lookupTranslation } from '@/modules/word-cache/lookup-service';
import { TranslateCache } from '@/modules/word-cache/translate-cache';

import { MemoryCacheFileStore } from '../../../helpers/memory-cache-store';

const NOW = new Date('2026-08-22T10:00:00Z').getTime();

function makeCaches() {
	const store = new MemoryCacheFileStore();
	return {
		translate: new TranslateCache(store, '_lib/cache/translate', () => NOW),
		audio: new AudioCache(store, '_lib/cache/audio', () => NOW),
	};
}

function fakeTranslationEngine(id: string, translation: string, fail = false): TranslationProvider {
	return {
		id,
		label: id,
		isConfigured: () => true,
		translate: fail
			? vi.fn().mockRejectedValue(new Error(id))
			: vi.fn().mockResolvedValue({ translation, engine: id }),
	};
}

describe('lookupTranslation', () => {
	it('returns none without a chain (translation disabled)', async () => {
		const { translate } = makeCaches();
		const outcome = await lookupTranslation({
			word: 'hello',
			cache: translate,
			chain: null,
			from: 'en',
			to: 'zh',
		});
		expect(outcome).toEqual({ record: null, source: 'none' });
	});

	it('stores engine results in the cache and hits the cache next time', async () => {
		const { translate } = makeCaches();
		const engine = fakeTranslationEngine('azure-translate', '你好');
		const chain = new TranslationChain([engine]);

		const first = await lookupTranslation({
			word: 'hello',
			cache: translate,
			chain,
			from: 'en',
			to: 'zh',
		});
		expect(first.source).toBe('engine');
		expect(first.record?.translation).toBe('你好');

		const second = await lookupTranslation({
			word: 'hello',
			cache: translate,
			chain,
			from: 'en',
			to: 'zh',
		});
		expect(second.source).toBe('current');
		expect(engine.translate).toHaveBeenCalledTimes(1);
	});

	it('reports none when every engine fails', async () => {
		const { translate } = makeCaches();
		const chain = new TranslationChain([fakeTranslationEngine('broken', '', true)]);
		const outcome = await lookupTranslation({
			word: 'hello',
			cache: translate,
			chain,
			from: 'en',
			to: 'zh',
		});
		expect(outcome.source).toBe('none');
	});
});

describe('CachedSpeechProvider', () => {
	const REQUEST = { word: 'hello', lang: 'en-US' };

	function synthEngine(bytes: Uint8Array) {
		return {
			id: 'azure',
			label: 'Azure',
			kind: 'cloud' as const,
			isAvailable: () => true,
			synthesize: vi.fn().mockResolvedValue(bytes.slice().buffer as ArrayBuffer),
			speak: vi.fn(),
		} satisfies SynthesizingSpeechProvider;
	}

	it('replays cached bytes without calling the engine', async () => {
		const { audio } = makeCaches();
		const mp3 = new Uint8Array([1, 2, 3]);
		await audio.put('hello', 'en-US', mp3.slice().buffer as ArrayBuffer);
		const inner = synthEngine(mp3);
		const play = vi.fn().mockResolvedValue(undefined);
		const provider = new CachedSpeechProvider(inner, audio, play);

		await provider.speak(REQUEST);
		expect(inner.synthesize).not.toHaveBeenCalled();
		expect(play).toHaveBeenCalledTimes(1);
	});

	it('stores fresh bytes from the engine, so the second speak is cached', async () => {
		const { audio } = makeCaches();
		const inner = synthEngine(new Uint8Array([4, 5]));
		const play = vi.fn().mockResolvedValue(undefined);
		const provider = new CachedSpeechProvider(inner, audio, play);

		await provider.speak(REQUEST);
		expect(inner.synthesize).toHaveBeenCalledTimes(1);
		expect(await audio.lookup('hello', 'en-US')).not.toBeNull();

		await provider.speak(REQUEST);
		expect(inner.synthesize).toHaveBeenCalledTimes(1);
	});

	it('delegates system engines untouched (nothing to cache)', async () => {
		const { audio } = makeCaches();
		const inner = {
			id: 'system',
			label: 'System',
			kind: 'system' as const,
			isAvailable: () => true,
			speak: vi.fn().mockResolvedValue(undefined),
		};
		const provider = new CachedSpeechProvider(inner, audio, vi.fn());

		await provider.speak(REQUEST);
		expect(inner.speak).toHaveBeenCalledWith(REQUEST);
	});
});
