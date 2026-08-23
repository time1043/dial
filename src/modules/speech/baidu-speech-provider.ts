import type { HttpFn } from '@/utils/http';

import { obsidianHttp } from '@/utils/http';
import { playAudioBuffer } from '@/utils/audio';

import type { SpeakRequest, SynthesizingSpeechProvider } from './speech-provider';

export const BAIDU_SPEECH_ID = 'baidu';

export interface BaiduSpeechCredentials {
	apiKey: string;
	secretKey: string;
}

interface BaiduToken {
	token: string;
	/** Unix timestamp (seconds) when the token expires. */
	expiry: number;
}

/**
 * Baidu Cloud speech (语音合成, short-text TTS). Signup needs only a
 * Chinese phone number plus real-name verification — no international
 * payment method. The credentials here are the AI-platform **API Key /
 * Secret Key** (used to mint an `access_token`), which are separate from
 * the translate appId/secret used by the translate engine.
 */
export class BaiduSpeechProvider implements SynthesizingSpeechProvider {
	readonly id = BAIDU_SPEECH_ID;
	readonly label = 'Baidu Cloud';
	readonly kind = 'cloud' as const;

	private token: BaiduToken | null = null;

	constructor(
		private readonly getCredentials: () => BaiduSpeechCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
		private readonly now: () => Date = () => new Date(),
	) {}

	isAvailable(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.apiKey.trim() !== '' && credentials.secretKey.trim() !== '';
	}

	private async getToken(): Promise<string> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isAvailable()) {
			throw new Error('baidu cloud is not configured');
		}
		const seconds = Math.floor(this.now().getTime() / 1000);
		if (this.token && this.token.expiry > seconds + 60) {
			return this.token.token;
		}

		const response = await this.http({
			url:
				'https://aip.baidubce.com/oauth/2.0/token' +
				`?grant_type=client_credentials` +
				`&client_id=${encodeURIComponent(credentials.apiKey)}` +
				`&client_secret=${encodeURIComponent(credentials.secretKey)}`,
			method: 'GET',
		});
		if (response.status !== 200) {
			throw new Error(`baidu token request failed (${response.status})`);
		}
		const data = JSON.parse(response.text) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!data.access_token) {
			throw new Error('baidu token error: no access_token returned');
		}
		const expiresIn = data.expires_in ?? 2592000;
		this.token = { token: data.access_token, expiry: seconds + expiresIn };
		return this.token.token;
	}

	async synthesize(request: SpeakRequest): Promise<ArrayBuffer> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isAvailable()) {
			throw new Error('baidu cloud is not configured');
		}
		const token = await this.getToken();
		const lan = request.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
		const params = new URLSearchParams({
			tex: request.word,
			tok: token,
			lan,
			ctp: '1',
			cuid: 'dial-word-card',
			aue: '3',
			spd: '5',
			pit: '5',
			vol: '5',
		});

		const response = await this.http({
			url: `https://tsn.baidu.com/text2audio?${params.toString()}`,
			method: 'GET',
		});
		// On success Baidu returns raw audio (audio/mpeg) with the bytes in
		// arrayBuffer; on failure it returns a JSON error body instead.
		if (response.status !== 200 || !response.arrayBuffer) {
			throw new Error(`baidu tts failed (${response.status}) ${response.text.slice(0, 200)}`);
		}
		return response.arrayBuffer;
	}

	async speak(request: SpeakRequest): Promise<void> {
		await playAudioBuffer(await this.synthesize(request));
	}
}
