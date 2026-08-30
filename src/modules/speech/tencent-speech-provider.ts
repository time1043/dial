import type { HttpFn } from '@/utils/http';
import type { Tc3Credentials } from '@/utils/tc3';

import { playAudioBuffer } from '@/utils/audio';
import { obsidianHttp } from '@/utils/http';
import { tc3SignedHeaders } from '@/utils/tc3';

import type { SpeakRequest, SynthesizingSpeechProvider } from './speech-provider';

export const TENCENT_SPEECH_ID = 'tencent';

/**
 * Tencent Cloud speech (speech synthesis, TextToVoice). Reuses the SAME
 * SecretId/SecretKey as the Tencent translator — one Tencent Cloud account
 * covers every service, and signup needs only a Chinese phone number plus
 * real-name verification (no international payment method).
 *
 * Standard voices: 1050 = WeJack (male en), 1051 = WeRose (female en),
 * 0 = 智美 (female zh). Unknown languages fall back per primary subtag:
 * English-family tags get an English voice, everything else Chinese.
 */
const TENCENT_VOICES: Record<string, number> = {
	'en-US': 1051,
	'en-GB': 1051,
	'zh-CN': 0,
};

function tencentVoice(lang: string): number {
	return TENCENT_VOICES[lang] ?? (lang.toLowerCase().startsWith('en') ? 1051 : 0);
}

function generateSessionId(now: () => Date): string {
	return `${Math.floor(now().getTime())}-${Math.random().toString(36).slice(2, 10)}`;
}

function decodeBase64(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export class TencentSpeechProvider implements SynthesizingSpeechProvider {
	readonly id = TENCENT_SPEECH_ID;
	readonly label = 'Tencent Cloud';
	readonly kind = 'cloud' as const;

	constructor(
		private readonly getCredentials: () => Tc3Credentials | null,
		private readonly http: HttpFn = obsidianHttp,
		private readonly now: () => Date = () => new Date(),
	) {}

	isAvailable(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.secretId.trim() !== '' && credentials.secretKey.trim() !== '';
	}

	async synthesize(request: SpeakRequest): Promise<ArrayBuffer> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isAvailable()) {
			throw new Error('tencent cloud is not configured');
		}
		const voiceType = tencentVoice(request.lang);
		const primaryLanguage = request.lang.toLowerCase().startsWith('en') ? 2 : 1;
		const payload = JSON.stringify({
			Text: request.word,
			SessionId: generateSessionId(this.now),
			VoiceType: voiceType,
			Codec: 'mp3',
			SampleRate: 16000,
			ModelType: 1,
			PrimaryLanguage: primaryLanguage,
		});

		const headers = await tc3SignedHeaders(
			{
				host: 'tts.tencentcloudapi.com',
				service: 'tts',
				action: 'TextToVoice',
				version: '2019-08-23',
				payload,
			},
			credentials,
			this.now,
		);

		const response = await this.http({
			url: 'https://tts.tencentcloudapi.com',
			method: 'POST',
			headers,
			body: payload,
		});
		if (response.status !== 200) {
			throw new Error(`tencent tts failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as {
			Response?: { Audio?: string; Error?: { Code?: string; Message?: string } };
		};
		if (data.Response?.Error) {
			throw new Error(`tencent tts error ${data.Response.Error.Code ?? 'unknown'}`);
		}
		if (!data.Response?.Audio) {
			throw new Error('tencent tts returned no audio');
		}
		return decodeBase64(data.Response.Audio);
	}

	async speak(request: SpeakRequest): Promise<void> {
		await playAudioBuffer(await this.synthesize(request));
	}
}
