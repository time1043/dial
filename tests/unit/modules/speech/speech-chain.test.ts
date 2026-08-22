import { describe, expect, it, vi } from 'vitest';

import type { SpeakRequest, SpeechProvider } from '@/modules/speech/speech-provider';

import { orderSpeechEngines, SpeechChain } from '@/modules/speech/speech-chain';

function fakeEngine(
	id: string,
	available: boolean,
	ok = true,
	kind: 'system' | 'cloud' = 'system',
): SpeechProvider {
	return {
		id,
		label: id,
		kind,
		isAvailable: () => available,
		speak: ok ? vi.fn().mockResolvedValue(undefined) : vi.fn().mockRejectedValue(new Error(id)),
	};
}

const REQUEST: SpeakRequest = { word: 'hello', lang: 'en-US' };

describe('orderSpeechEngines', () => {
	it('follows the stored order', () => {
		const system = fakeEngine('system', true);
		const azure = fakeEngine('azure', true);
		const google = fakeEngine('google', true);
		const ordered = orderSpeechEngines([system, azure, google], ['google', 'system', 'azure']);
		expect(ordered.map((p) => p.id)).toEqual(['google', 'system', 'azure']);
	});

	it('drops unknown ids and appends registry engines missing from the order', () => {
		const system = fakeEngine('system', true);
		const azure = fakeEngine('azure', true);
		const ordered = orderSpeechEngines([system, azure], ['gone', 'system']);
		// 'gone' is not in the registry; azure was not in the order so it
		// lands at the end instead of disappearing.
		expect(ordered.map((p) => p.id)).toEqual(['system', 'azure']);
	});
});

describe('SpeechChain', () => {
	it('is available when any engine is, and reports state in order', () => {
		const chain = new SpeechChain([fakeEngine('system', false), fakeEngine('azure', true)]);
		expect(chain.isAvailable()).toBe(true);
		expect(chain.statuses()).toEqual([
			{ id: 'system', label: 'system', state: 'unavailable' },
			{ id: 'azure', label: 'azure', state: 'available' },
		]);
	});

	it('marks an unavailable cloud engine as partial (needs key), not red', () => {
		const chain = new SpeechChain([fakeEngine('azure', false, true, 'cloud')]);
		expect(chain.statuses()[0]?.state).toBe('partial');
	});

	it('skips unavailable engines and falls back when one fails mid-speak', async () => {
		const broken = fakeEngine('broken', true, false);
		const fallback = fakeEngine('fallback', true);
		const chain = new SpeechChain([broken, fallback]);

		const engine = await chain.speakAndReport(REQUEST);
		expect(engine?.id).toBe('fallback');
		expect(broken.speak).toHaveBeenCalled();
		expect(fallback.speak).toHaveBeenCalled();
	});

	it('resolves null when no engine can speak', async () => {
		const chain = new SpeechChain([
			fakeEngine('system', false),
			fakeEngine('azure', true, false),
		]);
		expect(await chain.speakAndReport(REQUEST)).toBeNull();
	});

	it('rejects via the SpeechProvider facade when nothing can speak', async () => {
		const chain = new SpeechChain([fakeEngine('system', false)]);
		await expect(chain.speak(REQUEST)).rejects.toThrow(/no available speech engine/i);
	});
});
