import { describe, expect, it, vi } from 'vitest';

import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { AliyunSpeechProvider } from '@/modules/speech/aliyun-speech-provider';
import { BaiduSpeechProvider } from '@/modules/speech/baidu-speech-provider';
import { TencentSpeechProvider } from '@/modules/speech/tencent-speech-provider';
import { assertAudioResponse } from '@/utils/audio';

const FIXED_NOW = () => new Date('2026-08-23T12:00:00Z');

function audioBytes(): ArrayBuffer {
	// A plausible mp3 header ('ID3') — never starts with '{'.
	return new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x50]).buffer;
}

function jsonErrorBytes(): ArrayBuffer {
	return new TextEncoder().encode(
		JSON.stringify({ err_no: 2200, err_msg: 'tts get token failed' }),
	).buffer;
}

describe('assertAudioResponse', () => {
	it('passes real mp3 bytes through untouched', () => {
		expect(() => assertAudioResponse(audioBytes(), 'test')).not.toThrow();
	});

	it('throws with the parsed message on a JSON error body', () => {
		expect(() => assertAudioResponse(jsonErrorBytes(), 'test')).toThrow(
			/test tts returned a JSON error body: tts get token failed/,
		);
	});
});

describe('BaiduSpeechProvider', () => {
	const REQUEST = { word: 'hello', lang: 'en-US' };

	function makeProvider(http: (req: HttpTextRequest) => Promise<HttpTextResponse>) {
		return new BaiduSpeechProvider(() => ({ apiKey: 'ak', secretKey: 'sk' }), http, FIXED_NOW);
	}

	it('mints and caches an access token, then requests audio with lan=en', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = makeProvider(async (req) => {
			requests.push(req);
			if (req.url.includes('/oauth/2.0/token')) {
				return {
					status: 200,
					text: JSON.stringify({ access_token: 'btok', expires_in: 2592000 }),
				};
			}
			return { status: 200, text: '', arrayBuffer: audioBytes() };
		});

		await provider.synthesize(REQUEST);
		await provider.synthesize(REQUEST);

		const tokenReqs = requests.filter((r) => r.url.includes('/oauth/2.0/token'));
		expect(tokenReqs).toHaveLength(1);
		expect(new URL(tokenReqs[0]?.url ?? 'http://invalid').searchParams.get('client_id')).toBe(
			'ak',
		);

		const audioReq = requests.find((r) => r.url.includes('text2audio'));
		const audioUrl = new URL(audioReq?.url ?? 'http://invalid');
		expect(audioUrl.searchParams.get('tok')).toBe('btok');
		expect(audioUrl.searchParams.get('lan')).toBe('en');
		expect(audioUrl.searchParams.get('tex')).toBe('hello');
	});

	it('falls through with an error when the gateway answers 200 + JSON', async () => {
		const provider = makeProvider(async (req) => {
			if (req.url.includes('/oauth/2.0/token')) {
				return { status: 200, text: JSON.stringify({ access_token: 'btok' }) };
			}
			return { status: 200, text: '', arrayBuffer: jsonErrorBytes() };
		});

		await expect(provider.synthesize(REQUEST)).rejects.toThrow(
			/JSON error body: tts get token failed/,
		);
	});

	it('maps non-English languages to zh for synthesis', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = makeProvider(async (req) => {
			requests.push(req);
			if (req.url.includes('/oauth/2.0/token')) {
				return { status: 200, text: JSON.stringify({ access_token: 'btok' }) };
			}
			return { status: 200, text: '', arrayBuffer: audioBytes() };
		});
		await provider.synthesize({ word: 'bonjour', lang: 'fr-FR' });
		const audioUrl = new URL(requests.find((r) => r.url.includes('text2audio'))?.url ?? '');
		expect(audioUrl.searchParams.get('lan')).toBe('zh');
	});
});

describe('AliyunSpeechProvider', () => {
	const REQUEST = { word: 'hello', lang: 'en-US' };

	function makeProvider(http: (req: HttpTextRequest) => Promise<HttpTextResponse>) {
		return new AliyunSpeechProvider(
			() => ({ accessKeyId: 'akid', accessKeySecret: 'aks', appKey: 'app1' }),
			http,
			FIXED_NOW,
		);
	}

	it('synthesizes via the RESTful gateway with token, appkey, and voice', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = makeProvider(async (req) => {
			requests.push(req);
			if (req.url.includes('nls-meta')) {
				return {
					status: 200,
					text: JSON.stringify({ Token: { Id: 'atok', ExpireTime: 4102444800 } }),
				};
			}
			return { status: 200, text: '', arrayBuffer: audioBytes() };
		});

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)[0]).toBe(0x49);

		const ttsUrl = new URL(requests.find((r) => r.url.includes('/stream/v1/tts'))?.url ?? '');
		expect(ttsUrl.searchParams.get('appkey')).toBe('app1');
		expect(ttsUrl.searchParams.get('token')).toBe('atok');
		expect(ttsUrl.searchParams.get('voice')).toBe('Abby');
		expect(ttsUrl.searchParams.get('format')).toBe('mp3');
		expect(ttsUrl.searchParams.get('text')).toBe('hello');
	});

	it('falls through with an error when the gateway answers 200 + JSON', async () => {
		const provider = makeProvider(async (req) => {
			if (req.url.includes('nls-meta')) {
				return {
					status: 200,
					text: JSON.stringify({ Token: { Id: 'atok', ExpireTime: 4102444800 } }),
				};
			}
			return {
				status: 200,
				text: '',
				arrayBuffer: new TextEncoder().encode(
					JSON.stringify({ status: 403, message: 'Invalid token' }),
				).buffer,
			};
		});

		await expect(provider.synthesize(REQUEST)).rejects.toThrow(
			/JSON error body: Invalid token/,
		);
	});
});

describe('TencentSpeechProvider', () => {
	function audioBase64(): string {
		return btoa(String.fromCharCode(...new Uint8Array([0x49, 0x44, 0x33])));
	}

	function makeProvider() {
		return new TencentSpeechProvider(
			() => ({ secretId: 'sid', secretKey: 'skey' }),
			async () => ({
				status: 200,
				text: JSON.stringify({ Response: { Audio: audioBase64(), SessionId: 's' } }),
			}),
			FIXED_NOW,
		);
	}

	async function sentPayload(lang: string): Promise<Record<string, unknown>> {
		let sent: HttpTextRequest | undefined;
		const provider = new TencentSpeechProvider(
			() => ({ secretId: 'sid', secretKey: 'skey' }),
			async (req) => {
				sent = req;
				return {
					status: 200,
					text: JSON.stringify({ Response: { Audio: audioBase64() } }),
				};
			},
			FIXED_NOW,
		);
		await provider.synthesize({ word: 'test', lang });
		return JSON.parse(sent?.body ?? '{}') as Record<string, unknown>;
	}

	it('uses the Chinese voice with the Chinese primary language for zh', async () => {
		const payload = await sentPayload('zh-CN');
		expect(payload.VoiceType).toBe(0);
		expect(payload.PrimaryLanguage).toBe(1);
		expect(payload.Codec).toBe('mp3');
		expect(payload.Text).toBe('test');
	});

	it('keeps the English voice for en and falls back per primary subtag', async () => {
		expect((await sentPayload('en-US')).VoiceType).toBe(1051);
		expect((await sentPayload('en-GB')).VoiceType).toBe(1051);
		expect((await sentPayload('de-DE')).VoiceType).toBe(0);
	});

	it('surfaces API error codes instead of decoding empty audio', async () => {
		const provider = new TencentSpeechProvider(
			() => ({ secretId: 'sid', secretKey: 'skey' }),
			async () => ({
				status: 200,
				text: JSON.stringify({ Response: { Error: { Code: 'FailedOperation' } } }),
			}),
			FIXED_NOW,
		);
		await expect(provider.synthesize({ word: 'x', lang: 'en-US' })).rejects.toThrow(
			/tencent tts error FailedOperation/,
		);
	});

	it('reports unavailable without credentials', () => {
		expect(new TencentSpeechProvider(() => null).isAvailable()).toBe(false);
		expect(makeProvider().isAvailable()).toBe(true);
	});
});
