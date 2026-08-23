import type { AudioCache } from '@/modules/word-cache/audio-cache';

import { playAudioBuffer } from '@/utils/audio';

import type { SpeakRequest, SpeechProvider, SynthesizingSpeechProvider } from './speech-provider';

export function isSynthesizing(provider: SpeechProvider): provider is SynthesizingSpeechProvider {
	return typeof (provider as SynthesizingSpeechProvider).synthesize === 'function';
}

/**
 * Wraps a cloud speech engine with the audio cache: cached bytes replay
 * instantly (and offline), fresh bytes are stored for next time. System
 * engines pass through untouched — there is nothing worth caching.
 */
export class CachedSpeechProvider implements SpeechProvider {
	constructor(
		private readonly inner: SpeechProvider,
		private readonly cache: AudioCache,
		private readonly play: (data: ArrayBuffer) => Promise<void> = playAudioBuffer,
	) {}

	get id(): string {
		return this.inner.id;
	}

	get label(): string {
		return this.inner.label;
	}

	get kind(): 'system' | 'cloud' {
		return this.inner.kind;
	}

	isAvailable(): boolean {
		return this.inner.isAvailable();
	}

	async speak(request: SpeakRequest): Promise<void> {
		const cached = await this.cache.lookup(request.word, request.lang);
		if (cached) {
			await this.play(cached);
			return;
		}
		if (isSynthesizing(this.inner)) {
			const bytes = await this.inner.synthesize(request);
			await this.cache.put(request.word, request.lang, bytes);
			await this.play(bytes);
			return;
		}
		await this.inner.speak(request);
	}
}
