import { describe, expect, it } from 'vitest';

import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { AzureSpeechProvider } from '@/modules/speech/azure-speech-provider';
import { GoogleSpeechProvider } from '@/modules/speech/google-speech-provider';

const REQUEST = { word: "it's fine", lang: 'en-US' };

function binaryHttp(body: Uint8Array, capture?: (req: HttpTextRequest) => void) {
	return async (req: HttpTextRequest): Promise<HttpTextResponse> => {
		capture?.(req);
		return {
			status: 200,
			text: '',
			arrayBuffer: body.slice().buffer as ArrayBuffer,
		};
	};
}

describe('AzureSpeechProvider', () => {
	it('POSTs SSML to the region host and returns the audio bytes', async () => {
		let sent: HttpTextRequest | undefined;
		const mp3 = new Uint8Array([1, 2, 3]);
		const provider = new AzureSpeechProvider(
			() => ({ key: 'sk', region: 'eastus' }),
			binaryHttp(mp3, (req) => (sent = req)),
		);

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)).toEqual(mp3);
		expect(sent?.url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
		expect(sent?.headers?.['Ocp-Apim-Subscription-Key']).toBe('sk');
		expect(sent?.headers?.['X-Microsoft-OutputFormat']).toContain('mp3');
		// The word is XML-escaped inside SSML and a known lang gets a voice.
		expect(sent?.body).toContain('&apos;s fine');
		expect(sent?.body).toContain('en-US-AriaNeural');
	});

	it('is unavailable without credentials and refuses to synthesize', async () => {
		const provider = new AzureSpeechProvider(() => ({ key: '', region: '' }));
		expect(provider.isAvailable()).toBe(false);
		await expect(provider.synthesize(REQUEST)).rejects.toThrow(/not configured/i);
	});
});

describe('GoogleSpeechProvider', () => {
	it('sends the key + voice config and decodes the base64 audio', async () => {
		const mp3 = new Uint8Array([9, 9, 9, 9]);
		const b64 = btoa(String.fromCharCode(...mp3));
		let sent: HttpTextRequest | undefined;
		const provider = new GoogleSpeechProvider(
			() => 'gk',
			async (req) => {
				sent = req;
				return { status: 200, text: JSON.stringify({ audioContent: b64 }) };
			},
		);

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)).toEqual(mp3);
		expect(sent?.url).toContain(
			'https://texttospeech.googleapis.com/v1/text:synthesize?key=gk',
		);
		expect(JSON.parse(sent?.body ?? '{}')).toEqual({
			input: { text: "it's fine" },
			voice: { languageCode: 'en-US' },
			audioConfig: { audioEncoding: 'MP3' },
		});
	});

	it('is unavailable without a key', () => {
		expect(new GoogleSpeechProvider(() => '').isAvailable()).toBe(false);
	});
});
