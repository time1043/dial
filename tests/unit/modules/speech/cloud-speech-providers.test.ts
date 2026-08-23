import { describe, expect, it } from 'vitest';

import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { AliyunSpeechProvider } from '@/modules/speech/aliyun-speech-provider';
import { AzureSpeechProvider } from '@/modules/speech/azure-speech-provider';
import { BaiduSpeechProvider } from '@/modules/speech/baidu-speech-provider';
import { GoogleSpeechProvider } from '@/modules/speech/google-speech-provider';
import { TencentSpeechProvider } from '@/modules/speech/tencent-speech-provider';

const REQUEST = { word: "it's fine", lang: 'en-US' };

function binaryHttp(body: Uint8Array, capture?: (req: HttpTextRequest) => void) {
	return async (req: HttpTextRequest): Promise<HttpTextResponse> => {
		capture?.(req);
		return {
			status: 200,
			text: '',
			arrayBuffer: body.slice().buffer,
		};
	};
}

/** base64-encode raw bytes the way the cloud TTS responses do. */
function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
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

describe('TencentSpeechProvider', () => {
	it('POSTs a TC3-signed TextToVoice request and decodes base64 audio', async () => {
		let sent: HttpTextRequest | undefined;
		const mp3 = new Uint8Array([4, 5, 6]);
		const provider = new TencentSpeechProvider(
			() => ({ secretId: 'AKIDtest', secretKey: 'Gu5tKey' }),
			async (req) => {
				sent = req;
				return {
					status: 200,
					text: JSON.stringify({ Response: { Audio: toBase64(mp3) } }),
				};
			},
		);

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)).toEqual(mp3);
		expect(sent?.url).toBe('https://tts.tencentcloudapi.com');
		expect(sent?.headers?.Authorization).toContain('Credential=AKIDtest/');
		expect(sent?.headers?.['X-TC-Action']).toBe('TextToVoice');
		const payload = JSON.parse(sent?.body ?? '{}') as {
			Text: string;
			Codec: string;
			PrimaryLanguage: number;
		};
		expect(payload.Text).toBe("it's fine");
		expect(payload.Codec).toBe('mp3');
		expect(payload.PrimaryLanguage).toBe(2); // English
	});

	it('surfaces API error codes from the Response.Error field', async () => {
		const provider = new TencentSpeechProvider(
			() => ({ secretId: 'AKIDtest', secretKey: 'Gu5tKey' }),
			async () => ({
				status: 200,
				text: JSON.stringify({ Response: { Error: { Code: 'AuthFailure' } } }),
			}),
		);
		await expect(provider.synthesize(REQUEST)).rejects.toThrow(/AuthFailure/);
	});

	it('is unavailable without credentials', () => {
		expect(
			new TencentSpeechProvider(() => ({ secretId: ' ', secretKey: ' ' })).isAvailable(),
		).toBe(false);
	});
});

describe('BaiduSpeechProvider', () => {
	it('mints a token then GETs mp3 audio with the english language flag', async () => {
		const requests: HttpTextRequest[] = [];
		const mp3 = new Uint8Array([7, 8, 9]);
		const provider = new BaiduSpeechProvider(
			() => ({ apiKey: 'ak', secretKey: 'sk' }),
			async (req) => {
				requests.push(req);
				if (req.url.includes('oauth/2.0/token')) {
					return {
						status: 200,
						text: JSON.stringify({ access_token: 'TK', expires_in: 3600 }),
					};
				}
				return { status: 200, text: '', arrayBuffer: mp3.slice().buffer };
			},
		);

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)).toEqual(mp3);
		// First call fetches the token, second performs the synthesis.
		expect(requests).toHaveLength(2);
		const tts = requests[1];
		expect(tts?.url).toContain('https://tsn.baidu.com/text2audio');
		expect(tts?.url).toContain('lan=en');
		expect(tts?.url).toContain('aue=3');
		expect(tts?.url).toContain('tok=TK');
	});

	it('reuses a cached token across calls', async () => {
		let tokenCalls = 0;
		const provider = new BaiduSpeechProvider(
			() => ({ apiKey: 'ak', secretKey: 'sk' }),
			async (req) => {
				if (req.url.includes('oauth/2.0/token')) {
					tokenCalls++;
					return {
						status: 200,
						text: JSON.stringify({ access_token: 'TK', expires_in: 3600 }),
					};
				}
				return { status: 200, text: '', arrayBuffer: new Uint8Array([1]).buffer };
			},
		);
		await provider.synthesize(REQUEST);
		await provider.synthesize(REQUEST);
		expect(tokenCalls).toBe(1);
	});

	it('is unavailable without credentials', () => {
		expect(new BaiduSpeechProvider(() => ({ apiKey: ' ', secretKey: ' ' })).isAvailable()).toBe(
			false,
		);
	});
});

describe('AliyunSpeechProvider', () => {
	it('fetches an NLS token then GETs mp3 audio with the chosen voice', async () => {
		const requests: HttpTextRequest[] = [];
		const mp3 = new Uint8Array([11, 12]);
		const provider = new AliyunSpeechProvider(
			() => ({ accessKeyId: 'id', accessKeySecret: 'secret', appKey: 'appkey' }),
			async (req) => {
				requests.push(req);
				if (req.url.includes('nls-meta.cn-shanghai.aliyuncs.com')) {
					const future = Math.floor(Date.now() / 1000) + 3600;
					return {
						status: 200,
						text: JSON.stringify({ Token: { Id: 'TOK', ExpireTime: future } }),
					};
				}
				return { status: 200, text: '', arrayBuffer: mp3.slice().buffer };
			},
		);

		const audio = await provider.synthesize(REQUEST);
		expect(new Uint8Array(audio)).toEqual(mp3);
		expect(requests).toHaveLength(2);
		const tts = requests[1];
		expect(tts?.url).toContain('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts');
		expect(tts?.url).toContain('voice=Abby');
		expect(tts?.url).toContain('format=mp3');
		expect(tts?.url).toContain('token=TOK');
	});

	it('reuses a cached token and only calls CreateToken once', async () => {
		let tokenCalls = 0;
		const provider = new AliyunSpeechProvider(
			() => ({ accessKeyId: 'id', accessKeySecret: 'secret', appKey: 'appkey' }),
			async (req) => {
				if (req.url.includes('nls-meta.cn-shanghai.aliyuncs.com')) {
					tokenCalls++;
					const future = Math.floor(Date.now() / 1000) + 3600;
					return {
						status: 200,
						text: JSON.stringify({ Token: { Id: 'TOK', ExpireTime: future } }),
					};
				}
				return { status: 200, text: '', arrayBuffer: new Uint8Array([1]).buffer };
			},
		);
		await provider.synthesize(REQUEST);
		await provider.synthesize(REQUEST);
		expect(tokenCalls).toBe(1);
	});

	it('is unavailable without the appkey', () => {
		expect(
			new AliyunSpeechProvider(() => ({
				accessKeyId: 'id',
				accessKeySecret: 'secret',
				appKey: '',
			})).isAvailable(),
		).toBe(false);
	});
});
