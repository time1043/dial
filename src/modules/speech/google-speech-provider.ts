import type { HttpFn } from '@/utils/http';

import { playAudioBuffer } from '@/utils/audio';
import { obsidianHttp } from '@/utils/http';

import type { SpeakRequest, SynthesizingSpeechProvider } from './speech-provider';

export const GOOGLE_SPEECH_ID = 'google';

/**
 * Google Cloud Text-to-Speech (basic synthesize endpoint, API key auth).
 * Free tier covers 1M+ WaveNet / several M standard characters per month.
 */
export class GoogleSpeechProvider implements SynthesizingSpeechProvider {
	readonly id = GOOGLE_SPEECH_ID;
	readonly label = 'Google TTS';
	readonly kind = 'cloud' as const;

	constructor(
		private readonly getKey: () => string | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isAvailable(): boolean {
		const key = this.getKey();
		return !!key && key.trim() !== '';
	}

	async synthesize(request: SpeakRequest): Promise<ArrayBuffer> {
		const key = this.getKey();
		if (!key || !this.isAvailable()) {
			throw new Error('google tts is not configured');
		}
		const response = await this.http({
			url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				input: { text: request.word },
				voice: { languageCode: request.lang },
				audioConfig: { audioEncoding: 'MP3' },
			}),
		});
		if (response.status !== 200) {
			throw new Error(`google tts failed (${response.status})`);
		}
		const data = JSON.parse(response.text) as { audioContent?: string };
		if (!data.audioContent) {
			throw new Error('google tts returned no audio');
		}
		return decodeBase64(data.audioContent);
	}

	async speak(request: SpeakRequest): Promise<void> {
		await playAudioBuffer(await this.synthesize(request));
	}
}

function decodeBase64(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}
