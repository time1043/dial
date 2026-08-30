import type { NlsTokenProvider } from '@/utils/aliyun';
import type { HttpFn } from '@/utils/http';

import { createNlsTokenProvider } from '@/utils/aliyun';
import { playAudioBuffer, assertAudioResponse } from '@/utils/audio';
import { obsidianHttp } from '@/utils/http';

import type { SpeakRequest, SynthesizingSpeechProvider } from './speech-provider';

export const ALIYUN_SPEECH_ID = 'aliyun';

export interface AliyunSpeechCredentials {
	accessKeyId: string;
	accessKeySecret: string;
	/** NLS project appkey (separate from the AccessKey pair). */
	appKey: string;
}

/**
 * Alibaba Cloud speech (intelligent speech interaction, short-text TTS over the RESTful
 * `/stream/v1/tts` endpoint). Signup needs only a Chinese phone number
 * plus real-name verification — no international payment method.
 *
 * Authentication uses an NLS access `token` (minted via the POP/RPC-signed
 * CreateToken API) plus the project `appkey`. Voices: Abby (US female),
 * Emily (UK female), Xiaoyun (Chinese female). Languages outside this
 * set degrade to English (Abby) — the NLS short-text TTS voices on the
 * free tier cover English and Chinese only.
 */
const ALIYUN_VOICES: Record<string, string> = {
	'en-US': 'Abby',
	'en-GB': 'Emily',
	'zh-CN': 'Xiaoyun',
};
const DEFAULT_VOICE = 'Abby';

function aliyunVoice(lang: string): string {
	return ALIYUN_VOICES[lang] ?? (lang.toLowerCase().startsWith('zh') ? 'Xiaoyun' : DEFAULT_VOICE);
}

export class AliyunSpeechProvider implements SynthesizingSpeechProvider {
	readonly id = ALIYUN_SPEECH_ID;
	readonly label = 'Alibaba Cloud';
	readonly kind = 'cloud' as const;

	private readonly tokenProvider: NlsTokenProvider;

	constructor(
		private readonly getCredentials: () => AliyunSpeechCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
		now: () => Date = () => new Date(),
	) {
		this.tokenProvider = createNlsTokenProvider(
			() => {
				const credentials = this.getCredentials();
				return credentials
					? {
							accessKeyId: credentials.accessKeyId,
							accessKeySecret: credentials.accessKeySecret,
						}
					: null;
			},
			http,
			now,
		);
	}

	isAvailable(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return (
			credentials.accessKeyId.trim() !== '' &&
			credentials.accessKeySecret.trim() !== '' &&
			credentials.appKey.trim() !== ''
		);
	}

	async synthesize(request: SpeakRequest): Promise<ArrayBuffer> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isAvailable()) {
			throw new Error('alibaba cloud is not configured');
		}
		const token = await this.tokenProvider.getToken();
		const voice = aliyunVoice(request.lang);
		const params = new URLSearchParams({
			appkey: credentials.appKey,
			token,
			format: 'mp3',
			sample_rate: '16000',
			voice,
			text: request.word,
		});

		const response = await this.http({
			url: `https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts?${params.toString()}`,
			method: 'GET',
		});
		// The gateway returns HTTP 200 with a JSON body when synthesis
		// fails (bad token, quota, …) — throw so the chain falls through.
		if (response.status !== 200 || !response.arrayBuffer) {
			throw new Error(`alibaba tts failed (${response.status})`);
		}
		assertAudioResponse(response.arrayBuffer, 'alibaba');
		return response.arrayBuffer;
	}

	async speak(request: SpeakRequest): Promise<void> {
		await playAudioBuffer(await this.synthesize(request));
	}
}
