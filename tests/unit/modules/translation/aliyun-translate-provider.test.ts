import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { RpcParams } from '@/utils/aliyun';
import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { AliyunTranslateProvider } from '@/modules/translation/aliyun-translate-provider';

const CREDENTIALS = { accessKeyId: 'AKID', accessKeySecret: 'secret&' };
const FIXED_NOW = () => new Date('2026-08-23T12:00:00Z');

/** Independent POP/RPC reference implementation over node crypto. */
function referenceSignature(params: RpcParams): string {
	const special = (value: string) =>
		encodeURIComponent(value).replace(/\*/g, '%2A').replace(/%7E/g, '~');
	const canonical = Object.keys(params)
		.sort()
		.map((key) => `${special(key)}=${special(params[key] ?? '')}`)
		.join('&');
	const stringToSign = `GET&${special('/')}&${special(canonical)}`;
	return createHmac('sha1', `${CREDENTIALS.accessKeySecret}&`)
		.update(stringToSign)
		.digest('base64');
}

const REQUEST = { word: 'hello', from: 'en', to: 'zh' };

function makeProvider(http: (req: HttpTextRequest) => Promise<HttpTextResponse>) {
	return new AliyunTranslateProvider(() => CREDENTIALS, http, FIXED_NOW);
}

describe('AliyunTranslateProvider', () => {
	it('sends a signed TranslateGeneral request and extracts the translation', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = makeProvider(async (req) => {
			requests.push(req);
			return { status: 200, text: JSON.stringify({ Data: { Translated: '你好' } }) };
		});

		const result = await provider.translate(REQUEST);
		expect(result).toEqual({ translation: '你好', engine: 'aliyun-translate' });

		const url = new URL(requests[0]?.url ?? 'http://invalid');
		expect(url.origin + url.pathname).toBe('https://mt.aliyuncs.com/');
		expect(url.searchParams.get('Action')).toBe('TranslateGeneral');
		expect(url.searchParams.get('Version')).toBe('2018-10-12');
		expect(url.searchParams.get('SourceLanguage')).toBe('en');
		expect(url.searchParams.get('TargetLanguage')).toBe('zh');
		expect(url.searchParams.get('SourceText')).toBe('hello');
		expect(url.searchParams.get('Timestamp')).toBe('2026-08-23T12:00:00Z');

		// The sent signature must match a reference computation over the
		// params actually present in the URL.
		const sent: RpcParams = {};
		url.searchParams.forEach((value, key) => {
			sent[key] = value;
		});
		const sentSignature = sent.Signature ?? '';
		delete sent.Signature;
		expect(sentSignature).toBe(referenceSignature(sent));
	});

	it('is unconfigured with empty credentials and refuses to translate', async () => {
		const provider = new AliyunTranslateProvider(
			() => ({ accessKeyId: ' ', accessKeySecret: '' }),
			async () => ({ status: 200, text: '' }),
			FIXED_NOW,
		);
		expect(provider.isConfigured()).toBe(false);
		await expect(provider.translate(REQUEST)).rejects.toThrow(/not configured/i);
	});

	it('surfaces platform error codes', async () => {
		const provider = makeProvider(async () => ({
			status: 200,
			text: JSON.stringify({ Code: 'QuotaExceeded', Message: 'too much' }),
		}));
		await expect(provider.translate(REQUEST)).rejects.toThrow(/QuotaExceeded/);
	});

	it('throws when the response carries no translation', async () => {
		const provider = makeProvider(async () => ({
			status: 200,
			text: JSON.stringify({ Data: {} }),
		}));
		await expect(provider.translate(REQUEST)).rejects.toThrow(/no translation/);
	});
});
